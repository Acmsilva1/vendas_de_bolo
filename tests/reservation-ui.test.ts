import assert from 'node:assert/strict';
import test from 'node:test';
import { isReserved, reservationClock } from '../web/reservations';
import type { CartItem } from '../web/types';
const now = Date.parse('2026-10-20T15:00:00.000Z');
const item = { cake: { id: 1, price: 30 }, quantity: 2, status: 'active', expires_at: new Date(now + 600000).toISOString() } as CartItem;
test('cronômetro usa instante do servidor e expira exatamente no limite', () => {
  assert.equal(reservationClock(item.expires_at, now), '10:00');
  assert.equal(reservationClock(item.expires_at, now + 599001), '00:01');
  assert.equal(reservationClock(item.expires_at, now + 600000), '00:00');
  assert.equal(isReserved(item, now + 599999), true);
  assert.equal(isReserved(item, now + 600000), false);
});
test('item expirado permanece visual sem entrar no total dos ativos', () => {
  const expired = { ...item, status: 'expired' as const };
  const active = { ...item, cake: { ...item.cake, id: 2 } };
  const cart = [expired, active];
  assert.equal(cart.length, 2);
  assert.equal(isReserved(expired, now), false);
  assert.equal(cart.filter(row => isReserved(row, now)).reduce((sum, row) => sum + row.cake.price * row.quantity, 0), 60);
});
test('cronômetro nunca exibe tempo negativo nem renovar ao alterar quantidade', () => {
  assert.equal(reservationClock(item.expires_at, now + 700000), '00:00');
  assert.equal(isReserved({ ...item, quantity: 1 }, now + 600000), false);
});
