import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { hashPassword, verifyPasswordHash } from '../api/_db.js';

test('troca de senha exige sessão, origem, senha atual e CAS; revoga todas as sessões', async () => {
  process.env.NODE_ENV = 'production';
  process.env.URL_SUPABASE = 'https://password-fixture.supabase.co';
  process.env.SERVICE_ROLE_SUPABASE = 'sb_secret_password_fixture';
  process.env.ADMIN_SESSION_SECRET = 'password-test-secret-with-at-least-32-characters';
  delete process.env.ADMIN_INITIAL_PASSWORD;
  const nativeFetch = globalThis.fetch;
  const sessions = new Set<string>();
  const failures: string[] = [];
  const calls: any[] = [];
  let hash = hashPassword('old-fixture-password');
  let conflict = false;
  let blocked = false;
  let unavailable = false;
  let cleanupFailure = false;
  globalThis.fetch = (async (input: any, options: any) => {
    if (String(input).startsWith('http://127.0.0.1:')) return nativeFetch(input, options);
    if (!String(input).startsWith('https://password-fixture.supabase.co/')) throw Error('External request blocked');
    const { p_operation: op, p_data: data } = JSON.parse(options.body);
    calls.push({ op, data });
    if (op === 'health') return Response.json({ ok: true, version: 18 });
    if (op === 'admin_hash') return Response.json(data.username === 'Admin' ? hash : null);
    if (op === 'session_create') {
      if (data.credential_hash !== hash) return Response.json(false);
      sessions.add(data.token_hash); return Response.json(true);
    }
    if (op === 'session_valid') return Response.json(sessions.has(data.token_hash));
    if (op === 'login_blocked') return Response.json(blocked);
    if (op === 'login_failure') { failures.push(data.key); return Response.json(null); }
    if (op === 'login_clear' && cleanupFailure) return new Response('', { status: 503 });
    if (op === 'password_change') {
      if (unavailable) return new Response('', { status: 503 });
      assert.equal(data.username, 'Admin');
      assert.equal(data.credential_hash, hash);
      assert.match(data.token_hash, /^[a-f0-9]{64}$/);
      assert.match(data.new_hash, /^scrypt\$/);
      if (conflict || !sessions.has(data.token_hash)) return Response.json(false);
      hash = data.new_hash; sessions.clear(); return Response.json(true);
    }
    if (op === 'orders') return Response.json([]);
    return Response.json(null);
  }) as typeof fetch;
  const { default: app } = await import('../api/index.js');
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = 'http://127.0.0.1:' + (server.address() as any).port;
  async function request(path: string, options: RequestInit = {}) {
    const res = await nativeFetch(base + path, options); await res.text(); return res;
  }
  const login = (password = 'old-fixture-password') => request('/auth/login', {
    method: 'POST', headers: { origin: base, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'Admin', password })
  });
  const valid = { currentPassword: 'old-fixture-password', newPassword: ' new-fixture-password ', confirmPassword: ' new-fixture-password ', username: 'Attacker' };
  const change = (cookie: string, body: any = valid, origin = base) => request('/auth/password', {
    method: 'POST', headers: { origin, cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  const access = (cookie: string) => request('/orders', { headers: { cookie } });
  try {
    assert.equal((await change('')).status, 401);
    const cookie = (await login()).headers.get('set-cookie')!.split(';')[0];
    const secondCookie = (await login()).headers.get('set-cookie')!.split(';')[0];
    assert.equal((await change(cookie, valid, 'https://hostile.invalid')).status, 403);
    for (const body of [{}, { ...valid, newPassword: 'short', confirmPassword: 'short' },
      { ...valid, newPassword: 'x'.repeat(129), confirmPassword: 'x'.repeat(129) },
      { ...valid, confirmPassword: 'different' }, { ...valid, newPassword: valid.currentPassword, confirmPassword: valid.currentPassword },
      { ...valid, currentPassword: 'x'.repeat(257) }]) assert.equal((await change(cookie, body)).status, 400);
    assert.equal((await change(cookie, { ...valid, currentPassword: 'incorrect' })).status, 401);
    assert.equal(failures.length, 2);
    const failedKeys = [...failures];
    await login('incorrect');
    assert.ok(failures.slice(2).every(key => !failedKeys.includes(key)), 'password failure namespace differs from login');
    blocked = true;
    assert.equal((await change(cookie)).status, 429); blocked = false;
    conflict = true;
    assert.equal((await change(cookie)).status, 409); conflict = false;
    unavailable = true;
    assert.equal((await change(cookie)).status, 503); unavailable = false;
    cleanupFailure = true;
    const changed = await change(cookie);
    cleanupFailure = false;
    assert.equal(changed.status, 204);
    assert.match(changed.headers.get('set-cookie')!, /Max-Age=0/);
    assert.equal(verifyPasswordHash(valid.newPassword, hash), true, 'password spaces preserved');
    assert.equal(verifyPasswordHash(valid.newPassword.trim(), hash), false);
    assert.equal((await access(cookie)).status, 401);
    assert.equal((await access(secondCookie)).status, 401);
    assert.equal((await change(cookie)).status, 401);
    assert.equal((await login()).status, 401);
    assert.equal((await login(valid.newPassword)).status, 200);
    assert.equal(calls.filter(call => call.op === 'password_change').length, 3);
    assert.ok(calls.every(call => !JSON.stringify(call.data).includes('fixture-password')));
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    globalThis.fetch = nativeFetch;
  }
});
