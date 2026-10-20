export const MAX_DATABASE_ID = 2147483647;
export const MAX_STOCK = 1000000;
export const MAX_PRICE = 99999999.99;

export function positiveId(value: unknown): number | null {
  if (typeof value === 'string' && !/^[1-9]\d*$/.test(value)) return null;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 && number <= MAX_DATABASE_ID ? number : null;
}

export function finiteNumber(value: unknown, max: number, integer = false): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !/^\d+(?:\.\d+)?$/.test(value)) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > max || (integer && !Number.isInteger(number))) return null;
  return number;
}

export function validOrderItems(value: unknown): value is { cake_id: number; quantity: number }[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) return false;
  const quantities = new Map<number, number>();
  for (const item of value) {
    if (!item || typeof item !== 'object' || typeof item.cake_id !== 'number' || typeof item.quantity !== 'number'
      || positiveId(item.cake_id) === null || !Number.isInteger(item.quantity) || item.quantity <= 0 || item.quantity > MAX_STOCK) return false;
    const quantity = (quantities.get(item.cake_id) || 0) + item.quantity;
    if (quantity > MAX_STOCK) return false;
    quantities.set(item.cake_id, quantity);
  }
  return true;
}

export function validIdempotencyKey(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(value);
}
