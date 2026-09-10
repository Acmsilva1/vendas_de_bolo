import assert from 'node:assert/strict';
import test from 'node:test';
import { hashPassword, verifyPasswordHash } from '../api/_db';

test('gera hash scrypt e valida a senha correta', () => {
  const hash = hashPassword('senha-de-teste', 'salt-de-teste');
  assert.notEqual(hash, 'senha-de-teste');
  assert.equal(verifyPasswordHash('senha-de-teste', hash), true);
  assert.equal(verifyPasswordHash('senha-incorreta', hash), false);
});

test('rejeita formato de hash inválido', () => {
  assert.equal(verifyPasswordHash('senha-de-teste', 'texto-puro'), false);
});
