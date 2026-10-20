import { useCallback, useEffect, useRef, useState } from 'react';
import type { Cake, CartItem } from './types';
import type { CartReservation } from '../shared/reservations';

export type CartSnapshot = CartReservation<Cake>;
export function isReserved(item: CartItem, now: number): boolean {
  return item.status !== 'expired' && (!item.expires_at || Date.parse(item.expires_at) > now);
}
export function reservationClock(expiresAt: string | undefined, now: number): string {
  const seconds = Math.max(0, Math.ceil(((expiresAt ? Date.parse(expiresAt) : now) - now) / 1000));
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}
const TOKEN_KEY = 'delicias-cart-token';
function storedToken() { try { const saved = sessionStorage.getItem(TOKEN_KEY) || ''; return /^[A-Za-z0-9_-]{43}$/.test(saved) ? saved : ''; } catch { return ''; } }
function newToken() {
  const token = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  try { sessionStorage.setItem(TOKEN_KEY, token); } catch { /* Retained in memory. */ }
  return token;
}

export function useReservations(onError: (message: string) => void, onChange: () => void) {
  const [snapshot, setSnapshot] = useState<CartSnapshot>({ version: 0, server_time: new Date().toISOString(), items: [] });
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const token = useRef(storedToken());
  const current = useRef(snapshot);
  const offset = useRef(0);
  const locked = useRef(false);
  const reading = useRef(false);
  const callbacks = useRef({ onError, onChange });
  callbacks.current = { onError, onChange };
  const apply = useCallback((cart: CartSnapshot) => {
    if (!cart || !Array.isArray(cart.items) || cart.version < current.current.version) return;
    if (cart.version === current.current.version && Date.parse(cart.server_time) < Date.parse(current.current.server_time)) return;
    offset.current = Date.parse(cart.server_time) - Date.now();
    current.current = cart;
    setSnapshot(cart);
    setNow(Date.now() + offset.current);
  }, []);
  const refresh = useCallback(async () => {
    if (!token.current || locked.current || reading.current) return;
    reading.current = true;
    const requestToken = token.current;
    const version = current.current.version;
    try {
      const response = await fetch('/api/cart/reservation', { headers: { 'X-Cart-Token': requestToken }, cache: 'no-store' });
      const data = await response.json();
      if (response.ok && !locked.current && requestToken === token.current && version === current.current.version) apply(data.cart);
    } catch { /* A transport failure does not renew or remove reservations. */ }
    finally { reading.current = false; }
  }, [apply]);
  useEffect(() => {
    void refresh();
    const tick = window.setInterval(() => setNow(Date.now() + offset.current), 1000);
    const poll = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 3000);
    const focus = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', focus);
    return () => { clearInterval(tick); clearInterval(poll); window.removeEventListener('focus', focus); document.removeEventListener('visibilitychange', focus); };
  }, [refresh]);
  const mutate = useCallback(async (build: (items: CartItem[]) => { items: { cake_id: number; quantity: number }[]; renew_ids?: number[] }, id: number) => {
    if (locked.current) return false;
    locked.current = true; setBusy(true); setPendingId(id);
    if (!token.current) token.current = newToken();
    let success = false;
    try {
      const response = await fetch('/api/cart/reservation', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Cart-Token': token.current },
        body: JSON.stringify({ ...build(current.current.items), version: current.current.version })
      });
      const data = await response.json();
      if (data.cart) apply(data.cart);
      if (!response.ok || !data.success) throw new Error(data.error || 'Não foi possível reservar este item. Confira a disponibilidade.');
      success = true;
    } catch (error) { callbacks.current.onError(error instanceof Error ? error.message : 'Falha de conexão. Confira a sacola antes de tentar novamente.'); }
    finally { locked.current = false; setBusy(false); setPendingId(null); await refresh(); callbacks.current.onChange(); }
    return success;
  }, [apply, refresh]);
  const add = (cake: Cake, quantity: number, renew = false) => mutate(items => {
    const existing = items.find(item => item.cake.id === cake.id);
    const active = existing && isReserved(existing, Date.now() + offset.current);
    return { items: [...items.filter(item => item.cake.id !== cake.id).map(item => ({ cake_id: item.cake.id, quantity: item.quantity })), { cake_id: cake.id, quantity: active && !renew ? existing.quantity + quantity : quantity }], ...(!active && existing ? { renew_ids: [cake.id] } : {}) };
  }, cake.id);
  const remove = (id: number) => mutate(items => ({ items: items.filter(item => item.cake.id !== id).map(item => ({ cake_id: item.cake.id, quantity: item.quantity })) }), id);
  const update = (id: number, quantity: number) => mutate(items => ({ items: items.map(item => ({ cake_id: item.cake.id, quantity: item.cake.id === id ? Math.max(1, quantity) : item.quantity })) }), id);
  const clear = () => {
    token.current = ''; try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* optional storage */ }
    const empty = { version: 0, server_time: new Date().toISOString(), items: [] };
    current.current = empty; setSnapshot(empty);
  };
  return { cart: snapshot.items.map(item => ({ ...item, status: isReserved(item, now) ? 'active' as const : 'expired' as const })), now, version: snapshot.version, token: token.current, busy, pendingId, add, remove, update, clear, refresh };
}
