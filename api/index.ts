import { isItemCategory } from '../shared/categories.js';
import { createHmac, randomBytes } from 'crypto';
import { positiveId, finiteNumber, validOrderItems, validIdempotencyKey, validReservationToken, MAX_PRICE, MAX_STOCK } from './_validation.js';
import { databaseReadiness } from './_database-ready.js';
import { whatsappGreeting } from './_greeting.js';
import express, { Router, Request, Response, NextFunction } from 'express';
import {
  getStoreStatus,
  setStoreStatus,
  getCartReservation,
  setCartReservation,
  getAllCakes,
  getCakeById,
  getCakeImage,
  createCake,
  updateCake,
  updateStock,
  deleteCake,
  createOrder,
  getAllOrders,
  OrderPeriod,
  deleteOrder,
  updateOrderStatus,
  getStats,
  getAnnualSalesStats,
  initDatabase,
  isPostgresActive,
  updateTelegramDelivery,
  verifyAdminCredentials,
  isLoginBlocked,
  registerLoginFailure,
  clearLoginFailures
} from './_db.js';
import { OrderStatus } from './_types.js';
import { parseImageDataUrl } from './_image.js';
import { createSessionToken, readCookie, verifySessionToken } from './_auth.js';

export const apiRouter = Router();

const SESSION_TTL_SECONDS = 8 * 60 * 60;
const developmentSessionSecret = randomBytes(32).toString('hex');

function sessionSecret(): string {
  const configured = process.env.ADMIN_SESSION_SECRET || '';
  if (configured.length >= 32) return configured;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('ADMIN_SESSION_SECRET deve ter pelo menos 32 caracteres em produção.');
  }
  return developmentSessionSecret;
}

function escapeTelegramHtml(input: string): string {
  return input.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function sessionCookieName(): string {
  return process.env.NODE_ENV === 'production' ? '__Host-delicias_admin' : 'delicias_admin';
}

function requestOrigin(req: Request): string {
  const forwardedHost = (req.header('x-forwarded-host') || '').split(',')[0].trim();
  const forwardedProto = (req.header('x-forwarded-proto') || '').split(',')[0].trim();
  const host = forwardedHost || req.header('host') || '';
  const protocol = forwardedProto || req.protocol;
  return `${protocol}://${host}`;
}

function requireSameOrigin(req: Request, res: Response, next: NextFunction): void {
  const origin = req.header('origin');
  if (!origin || origin !== requestOrigin(req)) {
    res.status(403).json({ error: 'Origem da solicitação não autorizada.' });
    return;
  }
  next();
}

function loginAttemptKeys(req: Request, username: string): { key: string; limit: number }[] {
  const normalizedUser = username.toLocaleLowerCase('pt-BR');
  const hash = (value: string) => createHmac('sha256', sessionSecret()).update(value).digest('hex');
  return [
    { key: hash(`ip-user|${req.ip}|${normalizedUser}`), limit: 5 },
    { key: hash(`user|${normalizedUser}`), limit: 20 }
  ];
}

function isAdminRequest(req: Request): boolean {
  const token = readCookie(req.header('cookie'), sessionCookieName());
  return Boolean(token && verifySessionToken(token, sessionSecret()));
}

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!isAdminRequest(req)) {
    res.status(401).json({ error: 'Acesso administrativo não autorizado.' });
    return;
  }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const origin = req.header('origin');
    if (!origin || origin !== requestOrigin(req)) {
      res.status(403).json({ error: 'Origem da solicitação não autorizada.' });
      return;
    }
  }
  res.setHeader('Cache-Control', 'no-store');
  next();
}

async function sendTelegramNotification(
  message: string
): Promise<{ sent: boolean; error?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return { sent: false, error: 'Bot Telegram não configurado.' };

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message }),
      signal: AbortSignal.timeout(3000)
    });
    const body = await response.json() as { ok?: boolean; description?: string };
    if (!response.ok || !body.ok) throw new Error(body.description || `HTTP ${response.status}`);
    return { sent: true };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : 'Falha desconhecida no Telegram.' };
  }
}

// Função auxiliar para sanitizar strings e prevenir XSS/injeção
function sanitize(input: unknown, maxLength = 255): string {
  if (typeof input !== 'string') return '';
  return input.trim().slice(0, maxLength);
}

function sanitizeIngredients(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((item): item is string => typeof item === 'string')
    .map(item => sanitize(item, 100))
    .filter(Boolean)
    .slice(0, 30);
}

// ==============================================================================
// STATUS E SAÚDE DO BACKEND
// ==============================================================================
apiRouter.get('/health', async (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    database: isPostgresActive() ? 'PostgreSQL (Ativo)' : 'Indisponível',
    timestamp: new Date().toISOString()
  });
});

apiRouter.post('/auth/login', requireSameOrigin, async (req: Request, res: Response) => {
  try {
    const username = sanitize(req.body?.username, 60);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!username || !password || password.length > 256) {
      res.status(400).json({ error: 'Informe usuário e senha válidos (senha com até 256 caracteres).' });
      return;
    }
    const attemptKeys = loginAttemptKeys(req, username || 'desconhecido');

    if ((await Promise.all(attemptKeys.map(item => isLoginBlocked(item.key)))).some(Boolean)) {
      res.status(429).json({ error: 'Muitas tentativas. Aguarde 15 minutos.' });
      return;
    }

    const valid = Boolean(username && password && await verifyAdminCredentials(username, password));
    if (!valid) {
      await Promise.all(attemptKeys.map(item => registerLoginFailure(item.key, item.limit)));
      res.status(401).json({ error: 'Usuário ou senha inválidos.' });
      return;
    }

    await Promise.all(attemptKeys.map(item => clearLoginFailures(item.key)));
    const token = createSessionToken(username, sessionSecret(), SESSION_TTL_SECONDS);
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader(
      'Set-Cookie',
      `${sessionCookieName()}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_SECONDS}${secure}`
    );
    res.setHeader('Cache-Control', 'no-store');
    res.json({ authenticated: true, expiresIn: SESSION_TTL_SECONDS });
  } catch (err) {
    console.error('Erro no login administrativo:', err);
    res.status(503).json({ error: 'Acesso administrativo temporariamente indisponível.' });
  }
});

apiRouter.get('/auth/session', (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ authenticated: isAdminRequest(req) });
});

apiRouter.post('/auth/logout', requireAdmin, (req: Request, res: Response) => {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${sessionCookieName()}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}`
  );
  res.status(204).end();
});

// ==============================================================================
// ROTAS DE BOLOS (CATÁLOGO & ESTOQUE)
// ==============================================================================

apiRouter.get('/store/status', async (_req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  try { res.json({ store: await getStoreStatus() }); }
  catch { res.status(503).json({ error: 'Não foi possível consultar o status da loja.' }); }
});

apiRouter.put('/store/status', requireAdmin, async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  if (typeof req.body?.is_open !== 'boolean') {
    res.status(400).json({ error: 'Informe se a loja está aberta ou fechada.' }); return;
  }
  try { res.json({ store: await setStoreStatus(req.body.is_open) }); }
  catch { res.status(503).json({ error: 'Não foi possível alterar o status da loja.' }); }
});

// Reservas temporárias pertencem ao segredo da sacola, nunca ao IP ou a um ID público.
apiRouter.get('/cart/reservation', async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  const token = req.header('X-Cart-Token');
  if (!validReservationToken(token)) {
    res.status(400).json({ error: 'Identificação da sacola inválida.' }); return;
  }
  try {
    const result = await getCartReservation(token);
    res.status(result.success ? 200 : result.statusCode || 400).json(result);
  } catch {
    res.status(503).json({ error: 'Não foi possível consultar a reserva. Tente novamente.' });
  }
});

apiRouter.post('/cart/reservation', requireSameOrigin, async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  const token = req.header('X-Cart-Token');
  const items = req.body?.items;
  const version = req.body?.version;
  const renewIds = req.body?.renew_ids ?? [];
  if (!validReservationToken(token) || !Array.isArray(items) || (items.length > 0 && !validOrderItems(items))
    || !Number.isInteger(version) || version < 0 || version > 999999999
    || !Array.isArray(renewIds) || renewIds.length > 100 || new Set(renewIds).size !== renewIds.length
    || renewIds.some(id => typeof id !== 'number' || positiveId(id) === null || !items.some(item => item.cake_id === id))) {
    res.status(400).json({ error: 'Dados da reserva inválidos.' }); return;
  }
  const rateKey = createHmac('sha256', sessionSecret()).update('cart-ip|' + req.ip).digest('hex');
  try {
    const result = await setCartReservation(token, items, version, rateKey, renewIds);
    res.status(result.success ? 200 : result.statusCode || 400).json(result);
  } catch {
    res.status(503).json({ error: 'Não foi possível atualizar a reserva. Confira a sacola antes de tentar novamente.' });
  }
});

// Listagem pública para clientes (apenas ativos) ou completa para admin
apiRouter.get('/cakes', async (req: Request, res: Response) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    const onlyActive = req.query.all !== 'true' || !isAdminRequest(req);
    const [cakes, store] = await Promise.all([getAllCakes(onlyActive), getStoreStatus()]);
    res.json({ cakes, store, isPostgres: isPostgresActive() });
  } catch (err) {
    console.error('Erro ao buscar bolos:', err);
    res.status(500).json({ error: 'Erro ao listar bolos.' });
  }
});

apiRouter.get('/cakes/:id/image', async (req: Request, res: Response) => {
  try {
    const id = positiveId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: 'ID inválido.' });
      return;
    }
    const cake = await getCakeById(id, !isAdminRequest(req));
    if (!cake || (!cake.is_active && !isAdminRequest(req))) {
      res.status(404).json({ error: 'Imagem não encontrada.' });
      return;
    }
    const image = await getCakeImage(id);
    if (!image) {
      res.status(404).json({ error: 'Imagem não encontrada.' });
      return;
    }
    res.setHeader('Content-Type', image.mimeType);
    res.setHeader('Cache-Control', 'no-store');
    res.send(image.data);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao carregar imagem.' });
  }
});

// Buscar bolo individual
apiRouter.get('/cakes/:id', async (req: Request, res: Response) => {
  try {
    const id = positiveId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: 'ID inválido.' });
      return;
    }
    const cake = await getCakeById(id, !isAdminRequest(req));
    if (!cake || (!cake.is_active && !isAdminRequest(req))) {
      res.status(404).json({ error: 'Bolo não encontrado.' });
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.json({ cake });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar bolo.' });
  }
});

// Criar novo bolo (Admin)
apiRouter.post('/cakes', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { name, ingredients, category, price, stock_quantity, image_data_url } = req.body;

    const sanitizedName = sanitize(name, 100);
    if (!sanitizedName) {
      res.status(400).json({ error: 'O nome do bolo é obrigatório.' });
      return;
    }

    const numPrice = finiteNumber(price, MAX_PRICE);
    const numStock = stock_quantity === undefined ? 0 : finiteNumber(stock_quantity, MAX_STOCK, true);

    if (numPrice === null || numStock === null) {
      res.status(400).json({ error: 'Preço ou estoque inválido.' });
      return;
    }

    const image = parseImageDataUrl(image_data_url);
    if (!image) {
      res.status(400).json({ error: 'Selecione uma imagem para o bolo.' });
      return;
    }

    if (category !== undefined && !isItemCategory(category)) {
      res.status(400).json({ error: 'Categoria inválida.' }); return;
    }
    const validCategory = category === undefined ? 'comum' : category;

    const newCake = await createCake({
      name: sanitizedName,
      ingredients: sanitizeIngredients(ingredients),
      category: validCategory,
      price: numPrice,
      stock_quantity: numStock,
      image_url: '',
      is_active: true
    }, image);

    res.status(201).json({ cake: newCake, message: 'Bolo cadastrado com sucesso!' });
  } catch (err) {
    console.error('Erro ao cadastrar bolo:', err);
    const isImageError = err instanceof Error && /imagem|arquivo/i.test(err.message);
    if (err instanceof Error && 'statusCode' in err && err.statusCode === 409) { res.status(409).json({ error: 'Há unidades reservadas. Aguarde a expiração antes de reduzir o estoque.' }); return; }
    res.status(isImageError ? 400 : 500).json({
      error: isImageError ? err.message : 'Falha ao cadastrar bolo.'
    });
  }
});

// Atualizar informações gerais do bolo (Admin)
apiRouter.put('/cakes/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = positiveId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: 'ID inválido.' });
      return;
    }

    const { name, ingredients, category, price, stock_quantity, image_data_url, is_active } = req.body;
    const updateData: Record<string, unknown> = {};

    if (name !== undefined) {
      const cleanName = sanitize(name, 100);
      if (!cleanName) { res.status(400).json({ error: 'Nome inválido.' }); return; }
      updateData.name = cleanName;
    }
    if (ingredients !== undefined) updateData.ingredients = sanitizeIngredients(ingredients);
    if (category !== undefined) {
      if (!isItemCategory(category)) {
        res.status(400).json({ error: 'Categoria inválida.' });
        return;
      }
      updateData.category = category;
    }
    if (price !== undefined) {
      const value = finiteNumber(price, MAX_PRICE);
      if (value === null) { res.status(400).json({ error: 'Preço inválido.' }); return; }
      updateData.price = value;
    }
    if (stock_quantity !== undefined) {
      const value = finiteNumber(stock_quantity, MAX_STOCK, true);
      if (value === null) { res.status(400).json({ error: 'Estoque inválido.' }); return; }
      updateData.stock_quantity = value;
    }
    if (is_active !== undefined) {
      if (typeof is_active !== 'boolean') { res.status(400).json({ error: 'Estado ativo inválido.' }); return; }
      updateData.is_active = is_active;
    }

    const image = parseImageDataUrl(image_data_url);

    const updated = await updateCake(id, updateData, image);
    if (!updated) {
      res.status(404).json({ error: 'Bolo não encontrado.' });
      return;
    }

    res.json({ cake: updated, message: 'Bolo atualizado com sucesso!' });
  } catch (err) {
    const isImageError = err instanceof Error && /imagem|arquivo/i.test(err.message);
    if (err instanceof Error && 'statusCode' in err && err.statusCode === 409) { res.status(409).json({ error: 'Há unidades reservadas. Aguarde a expiração antes de reduzir o estoque.' }); return; }
    res.status(isImageError ? 400 : 500).json({
      error: isImageError ? err.message : 'Falha ao atualizar bolo.'
    });
  }
});

// Ajuste rápido de estoque (Admin)
apiRouter.patch('/cakes/:id/stock', requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = positiveId(req.params.id);
    const { new_stock, reason, notes } = req.body;

    const stock = finiteNumber(new_stock, MAX_STOCK, true);
    if (id === null || stock === null) {
      res.status(400).json({ error: 'Estoque numérico inválido.' });
      return;
    }

    const updated = await updateStock(
      id,
      stock,
      sanitize(reason, 40) || 'ajuste_manual',
      sanitize(notes, 200) || 'Ajuste rápido pelo painel administrativo'
    );

    if (!updated) {
      res.status(404).json({ error: 'Bolo não encontrado.' });
      return;
    }

    res.json({ cake: updated, message: `Estoque de "${updated.name}" atualizado para ${updated.stock_quantity} unidades.` });
  } catch (err) {
    if (err instanceof Error && 'statusCode' in err && err.statusCode === 409) { res.status(409).json({ error: 'Há unidades reservadas. Aguarde a expiração antes de reduzir o estoque.' }); return; }
    res.status(500).json({ error: 'Falha ao ajustar estoque.' });
  }
});

// Exclusão / Desativação de bolo (Admin)
apiRouter.delete('/cakes/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = positiveId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: 'ID inválido.' });
      return;
    }

    const success = await deleteCake(id);
    if (!success) {
      res.status(404).json({ error: 'Bolo não encontrado.' });
      return;
    }

    res.json({ message: 'Bolo desativado com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: 'Falha ao desativar bolo.' });
  }
});

// ==============================================================================
// ROTAS DE PEDIDOS (ORDERS) COM INTEGRAÇÃO TELEGRAM
// ==============================================================================

// Criar pedido (Cliente) -> Dedução de estoque e notificação interna pelo Telegram
apiRouter.post('/orders', async (req: Request, res: Response) => {
  try {
    const { customer_name, customer_phone, delivery_block, delivery_apartment, notes, payment_method, items } = req.body;

    const cleanName = sanitize(customer_name, 100);
    const cleanPhone = sanitize(customer_phone, 30).replace(/\D/g, '');

    if (!cleanName || !cleanPhone) {
      res.status(400).json({ error: 'Nome e telefone são obrigatórios para confirmar o pedido.' });
      return;
    }

    if (!/^27\d{8,9}$/.test(cleanPhone)) {
      res.status(400).json({ error: 'Informe um WhatsApp válido do Espírito Santo com DDD 27.' });
      return;
    }

    if (!validOrderItems(items)) {
      res.status(400).json({ error: 'Informe de 1 a 100 itens com IDs e quantidades inteiras positivas.' });
      return;
    }

    if (payment_method !== 'pix' && payment_method !== 'credito') {
      res.status(400).json({ error: 'Selecione PIX ou CRÉDITO/DÉBITO como forma de pagamento.' });
      return;
    }

    const cleanBlock = sanitize(delivery_block, 30);
    const cleanApartment = sanitize(delivery_apartment, 30);

    if (!cleanBlock || !cleanApartment) {
      res.status(400).json({ error: 'Bloco e apartamento são obrigatórios para a entrega.' });
      return;
    }

    const idempotencyKey = req.header('Idempotency-Key');
    if (!validIdempotencyKey(idempotencyKey)) {
      res.status(400).json({ error: 'Chave de confirmação inválida. Atualize a página e tente novamente.' }); return;
    }
    const reservationToken = req.header('X-Cart-Token');
    const reservationVersion = req.body?.reservation_version;
    if (!validReservationToken(reservationToken) || !Number.isInteger(reservationVersion) || reservationVersion < 0 || reservationVersion > 999999999) {
      res.status(400).json({ error: 'Confira a reserva dos itens na sacola antes de confirmar.' }); return;
    }
    const rateKey = createHmac('sha256', sessionSecret()).update('order-ip|' + req.ip).digest('hex');

    // Criar o pedido (valida estoque internamente e deduz)
    const result = await createOrder({
      customer_name: cleanName,
      customer_phone: cleanPhone,
      delivery_block: cleanBlock,
      delivery_apartment: cleanApartment,
      notes: sanitize(notes, 300),
      payment_method,
      items,
      idempotency_key: idempotencyKey,
      rate_key: rateKey,
      reservation_token: reservationToken,
      reservation_version: reservationVersion
    });

    if (!result.success || !result.order) {
      res.status(result.statusCode || 400).json({ error: result.error || 'Não foi possível processar o pedido.' });
      return;
    }

    const order = result.order;
    if (result.replayed) {
      res.status(200).json({ order, telegramSent: order.telegram_sent, message: 'Reserva já confirmada.' });
      return;
    }
    const whatsappMessage = whatsappGreeting();
    const whatsappLink = `https://wa.me/55${order.customer_phone}?text=${encodeURIComponent(whatsappMessage)}`;
    const itemsListText = order.items
      .map(it => `\u2022 ${it.quantity}x ${escapeTelegramHtml(it.cake_name)} (R$ ${it.subtotal.toFixed(2).replace('.', ',')})`)
      .join('\n');

    const formattedTelegramMessage =
      `\u{1F370} NOVA RESERVA — DEL\u00CDCIAS DA J\u00DA\n\n` +
      `\u{1F4E6} C\u00F3digo: ${escapeTelegramHtml(order.order_code)}\n` +
      `\u{1F464} Cliente: ${escapeTelegramHtml(order.customer_name)}\n` +
      `\u{1F4B3} Pagamento: ${order.payment_method === 'pix' ? 'PIX — conferir comprovante na entrega' : 'CRÉDITO/DÉBITO — aproximação na entrega'}\n` +
      `\u{1F4F1} WhatsApp: ${whatsappLink}\n` +
      `\u{1F69A} Entrega: Bloco ${escapeTelegramHtml(order.delivery_block)} \u2022 APT ${escapeTelegramHtml(order.delivery_apartment)}\n\n` +
      `\u{1F4CB} Itens:\n${itemsListText}\n\n` +
      `\u{1F4B0} Total: R$ ${order.total_amount.toFixed(2).replace('.', ',')}\n` +
      (order.notes ? `\u{1F4DD} Observa\u00E7\u00F5es: ${escapeTelegramHtml(order.notes)}\n` : '') +
      `\n${whatsappMessage}`;

    const telegram = await sendTelegramNotification(formattedTelegramMessage);
    try {
      await updateTelegramDelivery(order.id, telegram.sent, telegram.error);
    } catch {
      // The order has committed. A notification failure must not invite a second purchase.
      console.error('Falha ao registrar entrega da notificação; reserva preservada.');
    }
    order.telegram_sent = telegram.sent;

    res.status(201).json({
      order,
      telegramSent: telegram.sent,
      message: 'Reserva confirmada! Em breve o vendedor entrará em contato pelo WhatsApp para informar o prazo de entrega.'
    });
  } catch (err) {
    console.error('Erro ao criar pedido:', err);
    res.status(500).json({ error: 'Erro interno ao registrar pedido.' });
  }
});

// Listar todos os pedidos (Admin)
apiRouter.get('/orders', requireAdmin, async (req: Request, res: Response) => {
  try {
    const requestedPeriod = String(req.query.period || 'today');
    const validMonthPeriod = /^month-(?:[1-9]|1[0-2])$/.test(requestedPeriod);
    const period = requestedPeriod === 'today' || requestedPeriod === 'all' || validMonthPeriod
      ? requestedPeriod as OrderPeriod
      : 'today';
    const orders = await getAllOrders(period);
    res.json({ orders });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar pedidos.' });
  }
});

apiRouter.delete('/orders/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = positiveId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: 'ID inválido.' });
      return;
    }

    const deleted = await deleteOrder(id);
    if (!deleted) {
      res.status(404).json({ error: 'Pedido não encontrado.' });
      return;
    }

    res.status(204).end();
  } catch (err) {
    console.error('Erro ao excluir pedido:', err);
    res.status(500).json({ error: 'Erro ao excluir pedido.' });
  }
});

// Atualizar status do pedido (Admin)
apiRouter.patch('/orders/:id/status', requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = positiveId(req.params.id);
    const { status } = req.body;
    if (id === null) { res.status(400).json({ error: 'ID inválido.' }); return; }

    const validStatuses: OrderStatus[] = ['pendente', 'confirmado', 'preparando', 'pronto', 'entregue', 'cancelado'];
    if (!validStatuses.includes(status)) {
      res.status(400).json({ error: 'Status de pedido inválido.' });
      return;
    }

    const updated = await updateOrderStatus(id, status);
    if (!updated) {
      res.status(404).json({ error: 'Pedido não encontrado.' });
      return;
    }

    res.json({
      order: updated,
      message: `Status do pedido #${updated.order_code} alterado para ${status}.`
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao alterar status do pedido.' });
  }
});

// ==============================================================================
// ESTATÍSTICAS E CONFIGURAÇÃO
// ==============================================================================

apiRouter.get('/stats', requireAdmin, async (req: Request, res: Response) => {
  try {
    const stats = await getStats();
    res.json({ stats });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao calcular estatísticas.' });
  }
});

apiRouter.get('/dashboard', requireAdmin, async (req: Request, res: Response) => {
  try {
    const requestedYear = Number(req.query.year);
    const year = Number.isInteger(requestedYear) && requestedYear >= 2000 && requestedYear <= 2100
      ? requestedYear
      : new Date().getFullYear();
    res.json({ dashboard: await getAnnualSalesStats(year) });
  } catch (err) {
    console.error('Erro ao buscar dados do dashboard:', err);
    res.status(500).json({ error: 'Erro ao calcular dados do dashboard.' });
  }
});

const app = express();
export const ensureDatabase = databaseReadiness(initDatabase);

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});
export async function requireDatabase(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const database = await ensureDatabase();
    if (!database.isPostgres) {
      res.status(503).json({ error: database.message });
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
}
app.use(requireDatabase);
app.use((req, _res, next) => {
  const route = typeof req.query.route === 'string' ? req.query.route : '';
  if (route) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(req.query)) {
      if (key === 'route') continue;
      if (Array.isArray(value)) value.forEach(item => query.append(key, String(item)));
      else if (value !== undefined) query.set(key, String(value));
    }
    req.url = `/${route}${query.size ? `?${query.toString()}` : ''}`;
  }
  next();
});
app.use('/', apiRouter);
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Falha na função da API:', error);
  res.status(500).json({ error: 'Falha interna na API.' });
});

export default app;
