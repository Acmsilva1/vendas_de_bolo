import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { Pool, PoolClient } from 'pg';
import { AppStats, Cake, Order, OrderItem } from './_types';

let pgPool: Pool | null = null;
let usePostgres = false;

const cakeColumns = `
  id,
  nome AS name,
  descricao AS description,
  ingredientes AS ingredients,
  categoria AS category,
  preco AS price,
  quantidade_disponivel AS stock_quantity,
  CASE
    WHEN imagem_dados IS NOT NULL THEN '/api/cakes/' || id::text || '/image?v=' || floor(EXTRACT(EPOCH FROM atualizado_em))::bigint::text
    ELSE imagem_url
  END AS image_url,
  ativo AS is_active,
  criado_em AS created_at,
  atualizado_em AS updated_at
`;

const orderColumns = `
  id,
  codigo AS order_code,
  nome_cliente AS customer_name,
  whatsapp_cliente AS customer_phone,
  bloco AS delivery_block,
  apartamento AS delivery_apartment,
  observacoes AS notes,
  forma_pagamento AS payment_method,
  valor_total AS total_amount,
  status,
  telegram_enviado AS telegram_sent,
  criado_em AS created_at,
  atualizado_em AS updated_at
`;

function requirePool(): Pool {
  if (!usePostgres || !pgPool) {
    throw new Error('PostgreSQL indisponível. Operações persistentes foram bloqueadas.');
  }
  return pgPool;
}

function mapCake(row: Record<string, unknown>): Cake {
  return {
    ...(row as unknown as Cake),
    price: Number(row.price),
    stock_quantity: Number(row.stock_quantity)
  };
}

function mapOrder(row: Record<string, unknown>, items: OrderItem[] = []): Order {
  return {
    ...(row as unknown as Order),
    total_amount: Number(row.total_amount),
    items
  };
}

export function hashPassword(password: string, salt = randomBytes(16).toString('hex')): string {
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPasswordHash(password: string, storedHash: string): boolean {
  const [algorithm, salt, expectedHex] = storedHash.split('$');
  if (algorithm !== 'scrypt' || !salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function initDatabase(): Promise<{ isPostgres: boolean; message: string }> {
  const connectionString = process.env.DATABASE_URL || process.env.URL_SUPABASE;
  const schema = process.env.PGSCHEMA || 'vendas_de_bolo';

  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) {
    throw new Error('PGSCHEMA deve ser um identificador PostgreSQL válido em letras minúsculas.');
  }

  if (!connectionString && !process.env.PGHOST && !process.env.PGDATABASE) {
    return { isPostgres: false, message: 'PostgreSQL não configurado; gravações estão indisponíveis.' };
  }

  if (connectionString && !/^postgres(?:ql)?:\/\//i.test(connectionString)) {
    return {
      isPostgres: false,
      message: 'URL_SUPABASE deve conter a URI PostgreSQL do Supabase Pooler (postgresql://), não a URL HTTPS do projeto.'
    };
  }

  try {
    pgPool = new Pool({
      connectionString: connectionString || undefined,
      host: process.env.PGHOST || '127.0.0.1',
      port: Number(process.env.PGPORT) || 5432,
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD || 'postgres',
      database: process.env.PGDATABASE || 'db',
      options: `-c search_path=${schema}`,
      connectionTimeoutMillis: process.env.VERCEL ? 10000 : 3000,
      idleTimeoutMillis: 30000,
      max: process.env.VERCEL ? 2 : 10
    });

    await pgPool.query('SELECT 1');
    usePostgres = true;
    await runSchema(pgPool, schema);
    await ensureInitialAdmin(pgPool);
    return { isPostgres: true, message: `PostgreSQL conectado no schema ${schema}.` };
  } catch (error) {
    usePostgres = false;
    await pgPool?.end().catch(() => undefined);
    pgPool = null;
    const message = error instanceof Error ? error.message : String(error);
    return { isPostgres: false, message: `PostgreSQL indisponível: ${message}` };
  }
}

async function runSchema(pool: Pool, schema: string): Promise<void> {
  await pool.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      nome_usuario VARCHAR(60) UNIQUE NOT NULL,
      senha_hash TEXT NOT NULL,
      ativo BOOLEAN NOT NULL DEFAULT TRUE,
      criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS bolos (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(150) NOT NULL,
      descricao TEXT NOT NULL DEFAULT '',
      ingredientes TEXT[] NOT NULL DEFAULT '{}',
      categoria VARCHAR(50) NOT NULL DEFAULT 'comum'
        CHECK (categoria IN ('comum', 'com_cobertura')),
      preco NUMERIC(10, 2) NOT NULL CHECK (preco >= 0),
      quantidade_disponivel INTEGER NOT NULL DEFAULT 0 CHECK (quantidade_disponivel >= 0),
      imagem_url TEXT NOT NULL DEFAULT '',
      imagem_dados BYTEA,
      imagem_tipo VARCHAR(30),
      ativo BOOLEAN NOT NULL DEFAULT TRUE,
      criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    ALTER TABLE bolos ADD COLUMN IF NOT EXISTS ingredientes TEXT[] NOT NULL DEFAULT '{}';
    CREATE TABLE IF NOT EXISTS pedidos (
      id SERIAL PRIMARY KEY,
      codigo VARCHAR(24) UNIQUE NOT NULL,
      nome_cliente VARCHAR(120) NOT NULL,
      whatsapp_cliente VARCHAR(30) NOT NULL,
      bloco VARCHAR(30) NOT NULL,
      apartamento VARCHAR(30) NOT NULL,
      observacoes TEXT,
      valor_total NUMERIC(10, 2) NOT NULL CHECK (valor_total >= 0),
      status VARCHAR(30) NOT NULL DEFAULT 'pendente',
      telegram_enviado BOOLEAN NOT NULL DEFAULT FALSE,
      telegram_erro TEXT,
      forma_pagamento VARCHAR(20) NOT NULL DEFAULT 'credito'
        CHECK (forma_pagamento IN ('pix', 'credito')),
      criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS forma_pagamento VARCHAR(20) NOT NULL DEFAULT 'credito';
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'pedidos_forma_pagamento_check'
      ) THEN
        ALTER TABLE pedidos ADD CONSTRAINT pedidos_forma_pagamento_check
          CHECK (forma_pagamento IN ('pix', 'credito'));
      END IF;
    END $$;
    CREATE TABLE IF NOT EXISTS itens_pedido (
      id SERIAL PRIMARY KEY,
      pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
      bolo_id INTEGER NOT NULL REFERENCES bolos(id) ON DELETE RESTRICT,
      nome_bolo VARCHAR(150) NOT NULL,
      quantidade INTEGER NOT NULL CHECK (quantidade > 0),
      preco_unitario NUMERIC(10, 2) NOT NULL CHECK (preco_unitario >= 0),
      subtotal NUMERIC(10, 2) NOT NULL CHECK (subtotal >= 0)
    );
    CREATE TABLE IF NOT EXISTS logs (
      id BIGSERIAL PRIMARY KEY,
      pedido_id INTEGER REFERENCES pedidos(id) ON DELETE SET NULL,
      bolo_id INTEGER REFERENCES bolos(id) ON DELETE SET NULL,
      tipo VARCHAR(40) NOT NULL,
      descricao TEXT NOT NULL,
      quantidade_anterior INTEGER,
      quantidade_nova INTEGER,
      criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS tentativas_login (
      chave VARCHAR(64) PRIMARY KEY,
      tentativas INTEGER NOT NULL DEFAULT 0,
      bloqueado_ate TIMESTAMP WITH TIME ZONE,
      atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_bolos_ativos ON bolos(ativo);
    CREATE INDEX IF NOT EXISTS idx_bolos_quantidade ON bolos(quantidade_disponivel);
    CREATE INDEX IF NOT EXISTS idx_pedidos_criado_em ON pedidos(criado_em DESC);
    CREATE INDEX IF NOT EXISTS idx_pedidos_status ON pedidos(status);
    CREATE INDEX IF NOT EXISTS idx_itens_pedido_pedido ON itens_pedido(pedido_id);
    CREATE INDEX IF NOT EXISTS idx_logs_criado_em ON logs(criado_em DESC);
    CREATE INDEX IF NOT EXISTS idx_logs_pedido ON logs(pedido_id);
  `);
}

async function ensureInitialAdmin(pool: Pool): Promise<void> {
  const password = process.env.ADMIN_INITIAL_PASSWORD;
  if (!password) return;
  const username = process.env.ADMIN_INITIAL_USER || 'Admin';
  await pool.query(
    `INSERT INTO usuarios (nome_usuario, senha_hash)
     VALUES ($1, $2)
     ON CONFLICT (nome_usuario) DO NOTHING`,
    [username, hashPassword(password)]
  );
}

export function isPostgresActive(): boolean {
  return usePostgres;
}

export async function verifyAdminCredentials(username: string, password: string): Promise<boolean> {
  const result = await requirePool().query(
    'SELECT senha_hash FROM usuarios WHERE lower(nome_usuario) = lower($1) AND ativo = TRUE LIMIT 1',
    [username]
  );
  return result.rows.length === 1 && verifyPasswordHash(password, result.rows[0].senha_hash);
}

export async function isLoginBlocked(key: string): Promise<boolean> {
  const result = await requirePool().query(
    'SELECT bloqueado_ate > CURRENT_TIMESTAMP AS bloqueado FROM tentativas_login WHERE chave = $1',
    [key]
  );
  return result.rows[0]?.bloqueado === true;
}

export async function registerLoginFailure(key: string, maxAttempts: number): Promise<void> {
  await requirePool().query(
    `INSERT INTO tentativas_login (chave, tentativas, bloqueado_ate)
     VALUES ($1, 1, NULL)
     ON CONFLICT (chave) DO UPDATE SET
       tentativas = CASE
         WHEN tentativas_login.atualizado_em < CURRENT_TIMESTAMP - INTERVAL '15 minutes' THEN 1
         ELSE tentativas_login.tentativas + 1
       END,
       bloqueado_ate = CASE
         WHEN (CASE
           WHEN tentativas_login.atualizado_em < CURRENT_TIMESTAMP - INTERVAL '15 minutes' THEN 1
           ELSE tentativas_login.tentativas + 1
         END) >= $2 THEN CURRENT_TIMESTAMP + INTERVAL '15 minutes'
         ELSE NULL
       END,
       atualizado_em = CURRENT_TIMESTAMP`,
    [key, maxAttempts]
  );
}

export async function clearLoginFailures(key: string): Promise<void> {
  await requirePool().query('DELETE FROM tentativas_login WHERE chave = $1', [key]);
}

export async function getAllCakes(onlyActive = false): Promise<Cake[]> {
  const where = onlyActive ? 'WHERE ativo = TRUE' : '';
  const result = await requirePool().query(`SELECT ${cakeColumns} FROM bolos ${where} ORDER BY id`);
  return result.rows.map(mapCake);
}

export async function getCakeById(id: number): Promise<Cake | null> {
  const result = await requirePool().query(`SELECT ${cakeColumns} FROM bolos WHERE id = $1`, [id]);
  return result.rows[0] ? mapCake(result.rows[0]) : null;
}

interface CakeImageInput {
  buffer: Buffer;
  mimeType: string;
}

export async function createCake(
  data: Omit<Cake, 'id' | 'created_at' | 'updated_at'>,
  image?: CakeImageInput | null
): Promise<Cake> {
  const result = await requirePool().query(
    `INSERT INTO bolos (nome, descricao, ingredientes, categoria, preco, quantidade_disponivel, imagem_url, ativo, imagem_dados, imagem_tipo)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING ${cakeColumns}`,
    [
      data.name,
      data.description,
      data.ingredients,
      data.category,
      data.price,
      data.stock_quantity,
      data.image_url,
      data.is_active,
      image?.buffer || null,
      image?.mimeType || null
    ]
  );
  return mapCake(result.rows[0]);
}

export async function updateCake(id: number, data: Partial<Cake>, image?: CakeImageInput | null): Promise<Cake | null> {
  const existing = await getCakeById(id);
  if (!existing) return null;
  const merged = { ...existing, ...data };
  const result = await requirePool().query(
    `UPDATE bolos SET nome = $1, descricao = $2, ingredientes = $3, categoria = $4, preco = $5,
       quantidade_disponivel = $6, imagem_url = $7, ativo = $8,
       imagem_dados = COALESCE($9, imagem_dados), imagem_tipo = COALESCE($10, imagem_tipo),
       atualizado_em = CURRENT_TIMESTAMP
     WHERE id = $11 RETURNING ${cakeColumns}`,
    [
      merged.name,
      merged.description,
      merged.ingredients,
      merged.category,
      merged.price,
      merged.stock_quantity,
      merged.image_url,
      merged.is_active,
      image?.buffer || null,
      image?.mimeType || null,
      id
    ]
  );
  return result.rows[0] ? mapCake(result.rows[0]) : null;
}

export async function getCakeImage(id: number): Promise<{ data: Buffer; mimeType: string } | null> {
  const result = await requirePool().query(
    'SELECT imagem_dados, imagem_tipo FROM bolos WHERE id = $1 AND imagem_dados IS NOT NULL',
    [id]
  );
  if (!result.rows[0]) return null;
  return {
    data: result.rows[0].imagem_dados,
    mimeType: result.rows[0].imagem_tipo
  };
}

export async function updateStock(id: number, newStock: number, reason: string, notes?: string): Promise<Cake | null> {
  const pool = requirePool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query('SELECT nome, quantidade_disponivel FROM bolos WHERE id = $1 FOR UPDATE', [id]);
    if (!current.rows[0]) {
      await client.query('ROLLBACK');
      return null;
    }
    const previous = Number(current.rows[0].quantidade_disponivel);
    const safeStock = Math.max(0, Math.floor(newStock));
    const updated = await client.query(
      `UPDATE bolos SET quantidade_disponivel = $1, atualizado_em = CURRENT_TIMESTAMP
       WHERE id = $2 RETURNING ${cakeColumns}`,
      [safeStock, id]
    );
    await client.query(
      `INSERT INTO logs (bolo_id, tipo, descricao, quantidade_anterior, quantidade_nova)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, reason, notes || `Estoque de ${current.rows[0].nome} atualizado`, previous, safeStock]
    );
    await client.query('COMMIT');
    return mapCake(updated.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteCake(id: number): Promise<boolean> {
  const result = await requirePool().query(
    'UPDATE bolos SET ativo = FALSE, atualizado_em = CURRENT_TIMESTAMP WHERE id = $1',
    [id]
  );
  return (result.rowCount || 0) > 0;
}

export async function createOrder(data: {
  customer_name: string;
  customer_phone: string;
  delivery_block: string;
  delivery_apartment: string;
  notes?: string;
  payment_method: 'pix' | 'credito';
  items: { cake_id: number; quantity: number }[];
}): Promise<{ order: Order; success: boolean; error?: string }> {
  const quantities = new Map<number, number>();
  for (const item of data.items) {
    if (!Number.isInteger(item.cake_id) || !Number.isInteger(item.quantity) || item.quantity <= 0) {
      return { order: null as unknown as Order, success: false, error: 'Item ou quantidade inválida.' };
    }
    quantities.set(item.cake_id, (quantities.get(item.cake_id) || 0) + item.quantity);
  }

  const pool = requirePool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ids = [...quantities.keys()].sort((a, b) => a - b);
    const locked = await client.query(
      `SELECT ${cakeColumns} FROM bolos WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE`,
      [ids]
    );
    const cakes = new Map<number, Cake>(locked.rows.map(row => {
      const cake = mapCake(row);
      return [cake.id, cake];
    }));

    const processedItems: OrderItem[] = [];
    let totalAmount = 0;
    for (const id of ids) {
      const cake = cakes.get(id);
      const quantity = quantities.get(id) || 0;
      if (!cake || !cake.is_active) {
        await client.query('ROLLBACK');
        return { order: null as unknown as Order, success: false, error: `Bolo ID ${id} indisponível.` };
      }
      if (cake.stock_quantity < quantity) {
        await client.query('ROLLBACK');
        return {
          order: null as unknown as Order,
          success: false,
          error: `Estoque insuficiente para "${cake.name}". Disponíveis: ${cake.stock_quantity}.`
        };
      }
      const subtotal = Number((cake.price * quantity).toFixed(2));
      totalAmount += subtotal;
      processedItems.push({ cake_id: id, cake_name: cake.name, quantity, unit_price: cake.price, subtotal });
    }

    const orderCode = `DJU-${Date.now().toString(36).toUpperCase()}-${randomBytes(2).toString('hex').toUpperCase()}`;
    const insertedOrder = await client.query(
      `INSERT INTO pedidos
       (codigo, nome_cliente, whatsapp_cliente, bloco, apartamento, observacoes, valor_total, forma_pagamento, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pendente') RETURNING ${orderColumns}`,
      [orderCode, data.customer_name, data.customer_phone, data.delivery_block, data.delivery_apartment, data.notes || '', totalAmount, data.payment_method]
    );
    const orderId = Number(insertedOrder.rows[0].id);

    for (const item of processedItems) {
      const previous = cakes.get(item.cake_id)!.stock_quantity;
      const next = previous - item.quantity;
      await client.query(
        'UPDATE bolos SET quantidade_disponivel = $1, atualizado_em = CURRENT_TIMESTAMP WHERE id = $2',
        [next, item.cake_id]
      );
      await client.query(
        `INSERT INTO itens_pedido (pedido_id, bolo_id, nome_bolo, quantidade, preco_unitario, subtotal)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [orderId, item.cake_id, item.cake_name, item.quantity, item.unit_price, item.subtotal]
      );
      await client.query(
        `INSERT INTO logs (pedido_id, bolo_id, tipo, descricao, quantidade_anterior, quantidade_nova)
         VALUES ($1, $2, 'venda', $3, $4, $5)`,
        [orderId, item.cake_id, `Reserva ${orderCode}: ${item.quantity}x ${item.cake_name}`, previous, next]
      );
    }

    await client.query('COMMIT');
    return { order: mapOrder(insertedOrder.rows[0], processedItems), success: true };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function updateTelegramDelivery(orderId: number, sent: boolean, errorMessage = ''): Promise<void> {
  const pool = requirePool();
  await pool.query(
    `UPDATE pedidos SET telegram_enviado = $1, telegram_erro = $2, atualizado_em = CURRENT_TIMESTAMP WHERE id = $3`,
    [sent, errorMessage || null, orderId]
  );
  await pool.query(
    `INSERT INTO logs (pedido_id, tipo, descricao) VALUES ($1, $2, $3)`,
    [orderId, sent ? 'telegram_enviado' : 'telegram_falhou', sent ? 'Notificação enviada ao Telegram.' : `Falha no Telegram: ${errorMessage.slice(0, 300)}`]
  );
}

export type OrderPeriod = 'today' | `month-${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12}` | 'all';

export async function getAllOrders(period: OrderPeriod = 'all'): Promise<Order[]> {
  const brasiliaToday = `(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date`;
  const brasiliaDayStart = `(${brasiliaToday} AT TIME ZONE 'America/Sao_Paulo')`;
  const where = period === 'today'
    ? `WHERE criado_em >= ${brasiliaDayStart}
        AND criado_em < ${brasiliaDayStart} + INTERVAL '1 day'`
    : period.startsWith('month-')
      ? `WHERE criado_em >= (
           make_date(EXTRACT(YEAR FROM ${brasiliaToday})::int, ${period.slice(6)}, 1)
           AT TIME ZONE 'America/Sao_Paulo'
         )
         AND criado_em < (
           (
             make_date(EXTRACT(YEAR FROM ${brasiliaToday})::int, ${period.slice(6)}::int, 1)
             + INTERVAL '1 month'
           ) AT TIME ZONE 'America/Sao_Paulo'
         )`
      : period === 'all'
      ? ''
      : '';
  const ordersResult = await requirePool().query(`SELECT ${orderColumns} FROM pedidos ${where} ORDER BY criado_em DESC`);
  if (ordersResult.rows.length === 0) return [];
  const ids = ordersResult.rows.map(row => row.id);
  const itemsResult = await requirePool().query(
    `SELECT id, pedido_id AS order_id, bolo_id AS cake_id, nome_bolo AS cake_name,
      quantidade AS quantity, preco_unitario AS unit_price, subtotal
     FROM itens_pedido WHERE pedido_id = ANY($1::int[]) ORDER BY id`,
    [ids]
  );
  return ordersResult.rows.map(row => mapOrder(
    row,
    itemsResult.rows.filter(item => item.order_id === row.id).map(item => ({
      ...item,
      unit_price: Number(item.unit_price),
      subtotal: Number(item.subtotal)
    }))
  ));
}

export async function deleteOrder(id: number): Promise<boolean> {
  const result = await requirePool().query('DELETE FROM pedidos WHERE id = $1', [id]);
  return (result.rowCount || 0) > 0;
}

export async function updateOrderStatus(id: number, status: Order['status']): Promise<Order | null> {
  const result = await requirePool().query(
    `UPDATE pedidos SET status = $1, atualizado_em = CURRENT_TIMESTAMP WHERE id = $2 RETURNING ${orderColumns}`,
    [status, id]
  );
  if (!result.rows[0]) return null;
  const orders = await getAllOrders();
  return orders.find(order => order.id === id) || null;
}

export async function getStats(): Promise<AppStats> {
  const cakes = await getAllCakes();
  const orders = await getAllOrders();
  return {
    totalCakes: cakes.length,
    activeCakes: cakes.filter(cake => cake.is_active).length,
    totalUnitsInStock: cakes.reduce((total, cake) => total + (cake.is_active ? cake.stock_quantity : 0), 0),
    lowStockCount: cakes.filter(cake => cake.is_active && cake.stock_quantity <= 2).length,
    pendingOrdersCount: orders.filter(order => order.status === 'pendente').length,
    totalOrdersCount: orders.length,
    estimatedRevenue: orders.filter(order => order.status !== 'cancelado').reduce((total, order) => total + order.total_amount, 0)
  };
}

export interface AnnualSalesStats {
  year: number;
  months: { month: number; total: number; orders: number }[];
  topCakes: { cake_name: string; quantity: number; total: number }[];
}

export async function getAnnualSalesStats(year: number): Promise<AnnualSalesStats> {
  const pool = requirePool();
  const monthsResult = await pool.query(
    `SELECT EXTRACT(MONTH FROM criado_em)::int AS month,
       COALESCE(SUM(valor_total), 0)::numeric AS total,
       COUNT(*)::int AS orders
     FROM pedidos
     WHERE criado_em >= make_date($1, 1, 1)
       AND criado_em < make_date($1 + 1, 1, 1)
     GROUP BY 1
     ORDER BY 1`,
    [year]
  );
  const topCakesResult = await pool.query(
    `SELECT nome_bolo AS cake_name,
       SUM(quantidade)::int AS quantity,
       COALESCE(SUM(subtotal), 0)::numeric AS total
     FROM itens_pedido
     JOIN pedidos ON pedidos.id = itens_pedido.pedido_id
     WHERE pedidos.criado_em >= make_date($1, 1, 1)
     AND pedidos.criado_em < make_date($1 + 1, 1, 1)
     GROUP BY nome_bolo
     ORDER BY quantity DESC, total DESC
     LIMIT 10`,
    [year]
  );

  const monthMap = new Map(monthsResult.rows.map(row => [
    Number(row.month),
    { month: Number(row.month), total: Number(row.total), orders: Number(row.orders) }
  ]));

  return {
    year,
    months: Array.from({ length: 12 }, (_, index) => monthMap.get(index + 1) || {
      month: index + 1,
      total: 0,
      orders: 0
    }),
    topCakes: topCakesResult.rows.map(row => ({
      cake_name: row.cake_name,
      quantity: Number(row.quantity),
      total: Number(row.total)
    }))
  };
}
