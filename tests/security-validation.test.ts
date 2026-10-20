import assert from 'node:assert/strict';
import test from 'node:test';
import { positiveId, finiteNumber, validOrderItems, validIdempotencyKey, MAX_PRICE, MAX_STOCK } from '../api/_validation.js';
import { databaseReadiness } from '../api/_database-ready.js';
import { verifyPasswordHash, hashPassword } from '../api/_db.js';
import { readCookie, createSessionToken, verifySessionToken } from '../api/_auth.js';

test('IDs e números rejeitam coerção, frações, overflow e valores não finitos', () => {
  assert.equal(positiveId('12'), 12);
  for (const value of ['1abc', '1.5', '-1', '0', '', true, null, 2147483648]) assert.equal(positiveId(value), null);
  for (const value of ['', null, true, [], {}, 'Infinity', Infinity, NaN, -1, MAX_PRICE + 1]) {
    assert.equal(finiteNumber(value, MAX_PRICE), null);
  }
  assert.equal(finiteNumber('12.50', MAX_PRICE), 12.5);
  assert.equal(finiteNumber(0, MAX_STOCK, true), 0);
  assert.equal(finiteNumber(1.5, MAX_STOCK, true), null);
});

test('pedidos rejeitam null, negativos, frações e quantidades agregadas acima do limite', () => {
  for (const items of [null, [], [null], [{ cake_id: 1, quantity: -5 }], [{ cake_id: 1, quantity: 1.5 }], [{ cake_id: '1', quantity: 1 }], Array(101).fill({ cake_id: 1, quantity: 1 }), [{ cake_id: 1, quantity: MAX_STOCK }, { cake_id: 1, quantity: 1 }]]) {
    assert.equal(validOrderItems(items), false);
  }
  assert.equal(validOrderItems([{ cake_id: 1, quantity: 2 }]), true);
  assert.equal(validIdempotencyKey('order-fixture-0001'), true);
  assert.equal(validIdempotencyKey('short'), false);
  assert.equal(validIdempotencyKey('a'.repeat(129)), false);
});

test('hash malformado nunca valida senha nem ajusta o tamanho do scrypt', () => {
  const good = hashPassword('fixture', 'fixture-salt');
  assert.equal(verifyPasswordHash('fixture', good), true);
  for (const value of ['scrypt$fixture$zz', 'scrypt$fixture$00', 'scrypt$fixture$' + 'z'.repeat(128), good + '$extra', 'scrypt$$' + 'a'.repeat(128)]) {
    assert.equal(verifyPasswordHash('anything', value), false);
  }
});

test('cookie inválido e sessão com partes extras são rejeitados sem lançar erro', () => {
  assert.equal(readCookie('delicias_admin=%ZZ', 'delicias_admin'), '');
  const token = createSessionToken('Admin', 'fixture-secret', 3600);
  assert.equal(verifySessionToken(token + '.', 'fixture-secret'), null);
  assert.equal(verifySessionToken(token, 'fixture-secret')?.sub, 'Admin');
});

test('inicialização recupera após falha, respeita backoff e compartilha tentativas concorrentes', async () => {
  let clock = 0;
  let calls = 0;
  const ready = databaseReadiness(async () => ({ isPostgres: ++calls > 1, message: 'fixture' }), 1000, () => clock);
  assert.equal((await ready()).isPostgres, false);
  assert.equal((await ready()).isPostgres, false);
  assert.equal(calls, 1);
  clock = 1000;
  const results = await Promise.all([ready(), ready(), ready()]);
  assert.equal(results.every(r => r.isPostgres), true);
  assert.equal(calls, 2);
  await ready();
  assert.equal(calls, 2);
});

test('exceção na inicialização não fica permanentemente em cache', async () => {
  let calls = 0;
  const ready = databaseReadiness(async () => {
    if (++calls === 1) throw new Error('fixture outage');
    return { isPostgres: true, message: 'ready' };
  });
  await assert.rejects(ready(), /fixture outage/);
  assert.equal((await ready()).isPostgres, true);
});
