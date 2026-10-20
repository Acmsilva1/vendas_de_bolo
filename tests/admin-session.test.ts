import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { hashPassword } from '../api/_db.js';
import { createSessionToken, sessionTokenHash } from '../api/_auth.js';

test('sessão exige registro, revoga no logout, rotaciona no login e falha fechada', async () => {
  process.env.NODE_ENV = 'production';
  process.env.URL_SUPABASE = 'https://session-fixture.supabase.co';
  process.env.SERVICE_ROLE_SUPABASE = 'sb_secret_session_fixture';
  process.env.ADMIN_SESSION_SECRET = 'session-test-secret-with-at-least-32-characters';
  delete process.env.ADMIN_INITIAL_PASSWORD;
  const nativeFetch = globalThis.fetch;
  const sessions = new Set<string>();
  const hash = hashPassword('fixture-password');
  let unavailable = false;
  globalThis.fetch = (async (input: any, options: any) => {
    if (String(input).startsWith('http://127.0.0.1:')) return nativeFetch(input, options);
    if (!String(input).startsWith('https://session-fixture.supabase.co/')) throw Error('External request blocked');
    const { p_operation: op, p_data: data } = JSON.parse(options.body);
    if (op.startsWith('session_') && unavailable) return new Response('', { status: 503 });
    if (op === 'health') return Response.json({ ok: true, version: 18 });
    if (op === 'admin_hash') return Response.json(hash);
    if (op === 'login_blocked') return Response.json(false);
    if (op === 'session_create') {
      assert.equal(data.credential_hash, hash);
      assert.equal(data.ttl_seconds, 28800);
      assert.match(data.token_hash, /^[a-f0-9]{64}$/);
      sessions.add(data.token_hash);
      return Response.json(true);
    }
    if (op === 'session_valid') return Response.json(sessions.has(data.token_hash));
    if (op === 'session_revoke') { sessions.delete(data.token_hash); return Response.json(true); }
    if (op === 'orders') return Response.json([]);
    return Response.json(null);
  }) as typeof fetch;
  const { default: app } = await import('../api/index.js');
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + (server.address() as any).port;
  async function request(path: string, options: RequestInit = {}) {
    const response = await nativeFetch(base + path, options);
    await response.text();
    return response;
  }
  const access = (cookie: string) => request('/orders', { headers: { cookie } });
  const login = (cookie = '', password = 'fixture-password') => request('/auth/login', {
    method: 'POST', headers: { origin: base, 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ username: 'Admin', password })
  });
  try {
    assert.equal((await access('')).status, 401);
    const legacy = createSessionToken('Admin', process.env.ADMIN_SESSION_SECRET, 3600);
    assert.equal((await access('__Host-delicias_admin=' + legacy)).status, 401);
    assert.equal((await login('', 'wrong-password')).status, 401);
    const first = await login();
    assert.equal(first.status, 200);
    const firstHeader = first.headers.get('set-cookie')!;
    assert.ok(!/Max-Age|Expires=/i.test(firstHeader));
    for (const attribute of ['HttpOnly', 'Secure', 'SameSite=Strict', '__Host-']) assert.ok(firstHeader.includes(attribute));
    const firstCookie = firstHeader.split(';')[0];
    assert.equal((await access(firstCookie)).status, 200);
    const logout = await request('/auth/logout', { method: 'POST', headers: { cookie: firstCookie, origin: base } });
    assert.equal(logout.status, 204);
    assert.match(logout.headers.get('set-cookie')!, /Max-Age=0/);
    assert.equal((await access(firstCookie)).status, 401);
    const secondCookie = (await login()).headers.get('set-cookie')!.split(';')[0];
    assert.notEqual(secondCookie, firstCookie);
    const thirdCookie = (await login(secondCookie)).headers.get('set-cookie')!.split(';')[0];
    assert.notEqual(thirdCookie, secondCookie);
    assert.equal((await access(secondCookie)).status, 401);
    assert.equal((await access(thirdCookie)).status, 200);
    const expired = createSessionToken('Admin', process.env.ADMIN_SESSION_SECRET, -1);
    sessions.add(sessionTokenHash(expired));
    assert.equal((await access('__Host-delicias_admin=' + expired)).status, 401);
    unavailable = true;
    assert.equal((await access(thirdCookie)).status, 503);
    assert.equal((await request('/auth/logout', { method: 'POST', headers: { cookie: thirdCookie, origin: base } })).status, 503);
    assert.equal((await request('/auth/session', { headers: { cookie: thirdCookie } })).status, 503);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    globalThis.fetch = nativeFetch;
  }
});
