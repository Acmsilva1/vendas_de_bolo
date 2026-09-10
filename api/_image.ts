const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

export interface ParsedImage {
  buffer: Buffer;
  mimeType: string;
}

function hasValidSignature(buffer: Buffer, mimeType: string): boolean {
  if (mimeType === 'image/png') {
    return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  if (mimeType === 'image/jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimeType === 'image/webp') {
    return buffer.length >= 12
      && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
      && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  }
  return false;
}

export function parseImageDataUrl(input: unknown): ParsedImage | null {
  if (input === undefined || input === null || input === '') return null;
  if (typeof input !== 'string') throw new Error('Imagem inválida.');

  const match = input.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match || !ALLOWED_MIME_TYPES.has(match[1])) {
    throw new Error('Use uma imagem PNG, JPG ou WebP.');
  }

  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) {
    throw new Error('A imagem deve ter no máximo 3 MB.');
  }
  if (!hasValidSignature(buffer, match[1])) {
    throw new Error('O conteúdo do arquivo não corresponde ao formato da imagem.');
  }

  return { buffer, mimeType: match[1] };
}
