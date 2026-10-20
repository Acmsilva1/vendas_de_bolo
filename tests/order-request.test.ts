import assert from 'node:assert/strict';
import test from 'node:test';
import { pendingOrderKey, clearPendingOrder } from '../web/orderRequest.js';

test('pedido pendente conserva chave após recarregar sem armazenar dados pessoais', async () => {
  const data = new Map<string, string>();
  const storage = () => ({ getItem: (key: string) => data.get(key) || null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); } });
  const payload = JSON.stringify({ customer_name: 'Fixture', customer_phone: '27999990000', items: [{ cake_id: 1, quantity: 1 }] });
  const first = await pendingOrderKey(payload, storage);
  assert.equal(await pendingOrderKey(payload, storage), first);
  assert.equal([...data.values()].some(value => value.includes('Fixture') || value.includes('27999990000')), false);
  assert.notEqual(await pendingOrderKey(payload + ' ', storage), first);
  clearPendingOrder(storage);
  assert.equal(data.size, 0);
  assert.notEqual(await pendingOrderKey(payload, storage), first);
});

test('storage indisponível ou corrompido não impede uma chave válida', async () => {
  const key = await pendingOrderKey('fixture', () => { throw new Error('disabled'); });
  assert.match(key, /^[a-f0-9-]{36}$/);
  assert.doesNotThrow(() => clearPendingOrder(() => { throw new Error('disabled'); }));
  const corrupted = () => ({ getItem: () => 'broken-json', setItem: () => {}, removeItem: () => {} });
  assert.match(await pendingOrderKey('fixture', corrupted), /^[a-f0-9-]{36}$/);
});
