import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { once } from 'node:events';

test('mesmo middleware local/Vercel bloqueia falha inicial e recupera após backoff', async t => {
  process.env.URL_SUPABASE = 'https://fixture.supabase.co';
  process.env.SERVICE_ROLE_SUPABASE = 'sb_secret_fixture';
  delete process.env.ADMIN_INITIAL_PASSWORD;
  let clock = Date.now();
  t.mock.method(Date, 'now', () => clock);
  let calls = 0;
  const nativeFetch = globalThis.fetch;
  t.mock.method(globalThis, 'fetch', async () => ++calls === 1
    ? new Response('', { status: 503 }) : Response.json({ ok: true, version: 14 }));
  const { requireDatabase, apiRouter } = await import('../api/index.js');
  const app = express();
  app.use('/api', requireDatabase, apiRouter);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/health`;
  try {
    const first = await nativeFetch(url);
    assert.equal(first.status, 503); await first.text();
    const cachedFailure = await nativeFetch(url);
    assert.equal(cachedFailure.status, 503); await cachedFailure.text();
    assert.equal(calls, 1);
    clock += 1001;
    const recovered = await nativeFetch(url);
    assert.equal(recovered.status, 200);
    assert.equal((await recovered.json()).database, 'PostgreSQL (Ativo)');
    assert.equal(calls, 2);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
