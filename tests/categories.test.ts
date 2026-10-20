import assert from 'node:assert/strict';
import test from 'node:test';
import { ITEM_CATEGORIES, ITEM_CATEGORY_LABELS, isItemCategory } from '../shared/categories';

test('aceita doces e preserva o identificador existente da cobertura avulsa', () => {
  assert.equal(isItemCategory('sobremesas'), true);
  assert.equal(isItemCategory('com_cobertura'), true);
  assert.equal(ITEM_CATEGORY_LABELS.com_cobertura, 'Cobertura');
  assert.equal(ITEM_CATEGORIES.length, 3);
});

test('rejeita categorias fora do contrato e valores que não são strings', () => {
  for (const value of ['doces', 'cobertura', '', null, undefined, {}, 1]) {
    assert.equal(isItemCategory(value), false);
  }
});
