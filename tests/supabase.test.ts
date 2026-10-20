import assert from 'node:assert/strict';
import test from 'node:test';
import { getSupabaseConfig, supabaseRpc } from '../api/_supabase.js';
import {
  initDatabase, isPostgresActive, verifyAdminCredentials, hashPassword,
  getAllCakes, getCakeImage, createCake, updateCake, updateStock, deleteCake,
  createOrder, getAllOrders, updateOrderStatus, deleteOrder, getAnnualSalesStats,
  isLoginBlocked, registerLoginFailure, clearLoginFailures, updateTelegramDelivery
} from '../api/_db.js';

const config = { url: 'https://example.supabase.co', key: 'sb_secret_test_only' };
const legacy = (role: string) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.fake`;

test('HTTPS exige chave de backend e URL sem caminhos/credenciais', () => {
  assert.equal(getSupabaseConfig({ DATABASE_URL: 'postgresql://localhost/db' }), null);
  assert.deepEqual(getSupabaseConfig({ URL_SUPABASE: config.url, SERVICE_ROLE_SUPABASE: config.key }), config);
  assert.equal(getSupabaseConfig({ SUPABASE_URL: config.url, SUPABASE_SERVICE_ROLE_KEY: legacy('service_role') })?.key, legacy('service_role'));
  for (const url of ['http://example.supabase.co', `${config.url}/rest/v1`, 'https://user:pass@example.supabase.co', `${config.url}?x=1`]) {
    assert.throws(() => getSupabaseConfig({ URL_SUPABASE: url, SERVICE_ROLE_SUPABASE: config.key }), /HTTPS/);
  }
  for (const key of ['', 'sb_publishable_test', legacy('anon'), legacy('authenticated')]) {
    assert.throws(() => getSupabaseConfig({ URL_SUPABASE: config.url, SERVICE_ROLE_SUPABASE: key }), /chave secreta/);
  }
});

test('RPC usa HTTPS, apikey e Bearer somente para JWT legado', async t => {
  const calls: { url: string; options: RequestInit }[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    calls.push({ url, options });
    return Response.json({ ok: true });
  });
  for (const key of [config.key, legacy('service_role')]) {
    assert.deepEqual(await supabaseRpc({ ...config, key }, 'health'), { ok: true });
  }
  assert.equal(calls[0].url, `${config.url}/rest/v1/rpc/vendas_backend`);
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.cache, 'no-store');
  assert.equal((calls[0].options.headers as Record<string, string>).apikey, config.key);
  assert.equal((calls[0].options.headers as Record<string, string>).Authorization, undefined);
  assert.equal((calls[1].options.headers as Record<string, string>).Authorization, `Bearer ${legacy('service_role')}`);
  assert.deepEqual(JSON.parse(String(calls[0].options.body)), { p_operation: 'health', p_data: {} });
});

test('falhas HTTP/rede sao sanitizadas e gravacoes nao sao repetidas', async t => {
  let calls = 0;
  const mock = t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return new Response('private-customer-secret', { status: 403 });
  });
  await assert.rejects(supabaseRpc(config, 'order_create'), /chave secreta inválida/);
  assert.equal(calls, 1);
  mock.mock.mockImplementation(async () => new Response('private-customer-secret', { status: 404 }));
  await assert.rejects(supabaseRpc(config, 'health'), /012_supabase_https/);
  mock.mock.mockImplementation(async () => new Response('private-customer-secret', { status: 500 }));
  await assert.rejects(supabaseRpc(config, 'cakes'), err => String(err).includes('HTTP 500') && !String(err).includes('private-customer-secret'));
  mock.mock.mockImplementation(async () => { throw new Error(config.key); });
  await assert.rejects(supabaseRpc(config, 'cake_create'), err => String(err).includes('falha de rede') && !String(err).includes(config.key));
});

test('repositorio HTTPS prioriza URL_SUPABASE, valida senha no backend e preserva contratos', async t => {
  const names = ['URL_SUPABASE', 'SUPABASE_URL', 'SERVICE_ROLE_SUPABASE', 'DATABASE_URL', 'ADMIN_INITIAL_PASSWORD'];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  t.after(() => { for (const name of names) {
    if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name];
  } });
  process.env.URL_SUPABASE = config.url;
  process.env.SERVICE_ROLE_SUPABASE = config.key;
  process.env.DATABASE_URL = 'postgresql://wrong:wrong@unreachable.invalid/db';
  delete process.env.ADMIN_INITIAL_PASSWORD;
  const calls: { p_operation: string; p_data: any }[] = [];
  const hash = hashPassword('test-password');
  const mock = t.mock.method(globalThis, 'fetch', async (_url: string, options: RequestInit) => {
    const body = JSON.parse(String(options.body)); calls.push(body);
    return Response.json(body.p_operation === 'admin_hash' ? hash
      : body.p_operation === 'cake_image' ? { hex: '0102ff', mimeType: 'image/png' }
      : body.p_operation === 'cakes' || body.p_operation === 'orders' ? [] : null);
  });
  assert.equal((await initDatabase()).isPostgres, true);
  assert.equal(isPostgresActive(), true);
  assert.equal(await verifyAdminCredentials('Admin', 'test-password'), true);
  assert.equal(await verifyAdminCredentials('Admin', 'incorrect'), false);
  assert.deepEqual(await getAllCakes(true), []);
  assert.deepEqual(await getCakeImage(1), { data: Buffer.from([1, 2, 255]), mimeType: 'image/png' });
  const cake = { name: 'Teste', ingredients: ['cacau'], category: 'comum' as const, price: 10, stock_quantity: 2, image_url: '', is_active: true };
  await createCake(cake, { buffer: Buffer.from([1, 2]), mimeType: 'image/png' });
  await updateCake(1, { price: 12 });
  await updateStock(1, 5, 'ajuste');
  await deleteCake(1);
  await createOrder({ customer_name: 'Teste', customer_phone: '000', delivery_block: 'A', delivery_apartment: '1', payment_method: 'pix', items: [{ cake_id: 1, quantity: 2 }] });
  await getAllOrders('month-2');
  await updateOrderStatus(1, 'confirmado');
  await deleteOrder(1);
  await getAnnualSalesStats(2026);
  await isLoginBlocked('key');
  await registerLoginFailure('key', 5);
  await clearLoginFailures('key');
  await updateTelegramDelivery(1, false, 'desativado');
  assert.equal(calls[0].p_operation, 'health');
  assert.equal(calls.some(call => JSON.stringify(call.p_data).includes('test-password')), false);
  assert.deepEqual(calls.find(call => call.p_operation === 'cake_create')?.p_data.image, { hex: '0102', mimeType: 'image/png' });
  assert.equal(calls.find(call => call.p_operation === 'stock')?.p_data.newStock, 5);
  assert.equal(calls.find(call => call.p_operation === 'orders')?.p_data.period, 'month-2');
  // HTTPS errors must fail closed; never fall back to an old DATABASE_URL.
  mock.mock.mockImplementation(async () => new Response('', { status: 401 }));
  assert.equal((await initDatabase()).isPostgres, false);
  assert.equal(isPostgresActive(), false);
  await assert.rejects(getAllCakes(), /Operações persistentes foram bloqueadas/);
});
