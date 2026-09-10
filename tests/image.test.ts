import assert from 'node:assert/strict';
import test from 'node:test';
import { parseImageDataUrl } from '../api/_image';

test('aceita uma imagem PNG válida', () => {
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
  const parsed = parseImageDataUrl(`data:image/png;base64,${png.toString('base64')}`);
  assert.equal(parsed?.mimeType, 'image/png');
  assert.deepEqual(parsed?.buffer, png);
});

test('rejeita arquivo disfarçado de imagem', () => {
  const fake = Buffer.from('isto nao e um png');
  assert.throws(
    () => parseImageDataUrl(`data:image/png;base64,${fake.toString('base64')}`),
    /conteúdo do arquivo/
  );
});
