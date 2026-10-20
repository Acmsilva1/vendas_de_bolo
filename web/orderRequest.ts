const STORAGE_KEY = 'delicias-pending-order';
type PendingStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export async function pendingOrderKey(payload: string, storage: () => PendingStorage = () => sessionStorage): Promise<string> {
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload))))
    .map(byte => byte.toString(16).padStart(2, '0')).join('');
  let key: string = crypto.randomUUID();
  try {
    const store = storage();
    const saved = JSON.parse(store.getItem(STORAGE_KEY) || 'null');
    if (saved?.digest === digest && typeof saved.key === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(saved.key)) key = saved.key;
    // Never persist names, phone numbers or delivery addresses.
    store.setItem(STORAGE_KEY, JSON.stringify({ digest, key }));
  } catch { /* Storage can be disabled; the caller retains the key in memory. */ }
  return key;
}

export function clearPendingOrder(storage: () => PendingStorage = () => sessionStorage): void {
  try { storage().removeItem(STORAGE_KEY); } catch { /* optional storage */ }
}
