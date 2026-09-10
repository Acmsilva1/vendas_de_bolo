import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken, readCookie, verifySessionToken } from '../api/_auth';

const secret = 'teste-seguro-com-mais-de-trinta-e-dois-caracteres';
const now = Date.UTC(2026, 8, 7);

test('cria e valida sessão administrativa assinada', () => {
  const token = createSessionToken('Admin', secret, 3600, now);
  assert.equal(verifySessionToken(token, secret, now)?.sub, 'Admin');
});

test('rejeita sessão adulterada ou expirada', () => {
  const token = createSessionToken('Admin', secret, 1, now);
  assert.equal(verifySessionToken(`${token}x`, secret, now), null);
  assert.equal(verifySessionToken(token, secret, now + 2000), null);
});

test('lê somente o cookie solicitado', () => {
  assert.equal(readCookie('tema=claro; delicias_admin=abc.def', 'delicias_admin'), 'abc.def');
});
