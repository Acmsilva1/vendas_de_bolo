import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Cake, Order } from './types';
import { useReservations } from './reservations';
import { StoreClosed } from './components/StoreClosed';
import type { StoreStatus } from '../shared/store';
import { Navbar } from './components/Navbar';
import { CakeCatalog } from './components/CakeCatalog';
import { OrderModal } from './components/OrderModal';
import { AdminDashboard } from './components/AdminDashboard';
import { CheckCircle2, AlertCircle, LockKeyhole } from 'lucide-react';

const catalogWallpaper = `url("data:image/svg+xml,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="220" height="220" viewBox="0 0 220 220">
    <g fill="#f9a8d4" fill-opacity=".28" stroke="#be185d" stroke-width="3" opacity=".7">
      <path d="M31 48h38l-4 19H35zM34 48c0-8 4-13 9-13s9 5 9 13c0-8 4-13 9-13s9 5 9 13"/>
      <path d="M29 67h42l-5 8H34zM42 83h42l-4 19H46zM45 83c0-8 4-13 9-13s9 5 9 13c0-8 4-13 9-13s9 5 9 13M40 102h46"/>
      <path d="M151 38h35v8h-35zM155 46v28h27V46M151 74h35M158 52h21M158 60h21"/>
    </g>
    <g fill="#a78bfa" opacity=".42">
      <circle cx="150" cy="144" r="20"/><circle cx="174" cy="144" r="20"/><circle cx="162" cy="126" r="20"/>
    </g>
    <path d="M140 144h44l-5 28h-34z" fill="#f9a8d4" opacity=".42"/>
    <path d="M137 173h50" stroke="#be185d" stroke-width="3" opacity=".7"/>
  </svg>
`)})")`;

export const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<'catalog' | 'admin'>(() => (
    sessionStorage.getItem('delicias-current-view') === 'admin' ? 'admin' : 'catalog'
  ));
  const [cakes, setCakes] = useState<Cake[]>([]);

  const [isCartModalOpen, setIsCartModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [isLoadingCakes, setIsLoadingCakes] = useState(true);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [isCheckingAdminSession, setIsCheckingAdminSession] = useState(true);
  const [loginUser, setLoginUser] = useState('Admin');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  const [storeStatus, setStoreStatus] = useState<StoreStatus | null>(null);
  const [storeUpdating, setStoreUpdating] = useState(false);
  const [storeLoadError, setStoreLoadError] = useState('');
  const cakesRequest = useRef(0);

  // Buscar bolos do backend
  const fetchCakes = async (includeInactive = currentView === 'admin' && isAdminAuthenticated) => {
    const request = ++cakesRequest.current;
    try {
      const res = await fetch(includeInactive ? '/api/cakes?all=true' : '/api/cakes');
      if (includeInactive && res.status === 401) setIsAdminAuthenticated(false);
      if (res.ok) {
        const data = await res.json();
        if (request !== cakesRequest.current) return;
        if (typeof data.store?.is_open !== 'boolean') throw new Error('O backend ainda não fornece o status da loja. Reinicie o servidor local ou atualize o deploy com a migration 015.');
        setStoreLoadError('');
        setStoreStatus(data.store);
        if (!data.store.is_open) setIsCartModalOpen(false);
        setCakes(data.cakes || []);
      } else {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Não foi possível consultar o status da loja.');
      }
    } catch (err) {
      if (request !== cakesRequest.current) return;
      setStoreLoadError(err instanceof Error ? err.message : 'Não foi possível consultar o status da loja.');
      console.error('Erro ao buscar bolos:', err);
    } finally {
      setIsLoadingCakes(false);
    }
  };

  const reservations = useReservations(message => showToast(message, 'error'), () => { void fetchCakes(); });
  const cart = reservations.cart;

  const checkAdminSession = async () => {
    try {
      const res = await fetch('/api/auth/session', { cache: 'no-store' });
      const data = await res.json();
      setIsAdminAuthenticated(Boolean(res.ok && data.authenticated));
    } catch {
      setIsAdminAuthenticated(false);
    } finally {
      setIsCheckingAdminSession(false);
    }
  };

  useEffect(() => {
    fetchCakes(false);
    checkAdminSession();
  }, []);

  useEffect(() => {
    sessionStorage.setItem('delicias-current-view', currentView);
  }, [currentView]);

  useEffect(() => {
    if (currentView === 'admin' && isAdminAuthenticated) void fetchCakes(true);
    const refresh = () => { if (document.visibilityState === 'visible') void fetchCakes(currentView === 'admin' && isAdminAuthenticated); };
    const refreshInterval = window.setInterval(refresh, currentView === 'catalog' ? 3000 : 60_000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.clearInterval(refreshInterval); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [currentView, isAdminAuthenticated]);

  const handleViewChange = (view: 'catalog' | 'admin') => {
    setCurrentView(view);
    if (view === 'catalog') fetchCakes(false);
    if (view === 'admin' && isAdminAuthenticated) fetchCakes(true);
  };

  const handleAdminLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoginError('');
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: loginUser, password: loginPassword })
    });
    const data = await response.json();
    if (!response.ok || !data.authenticated) {
      setLoginError(data.error || 'Não foi possível entrar.');
      return;
    }
    setIsAdminAuthenticated(true);
    setLoginPassword('');
    await fetchCakes(true);
  };

  const handleToggleStore = async () => {
    if (!storeStatus || storeUpdating) return;
    setStoreUpdating(true);
    // Invalidate a catalog response started before this change.
    cakesRequest.current++;
    try {
      const response = await fetch('/api/store/status', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_open: !storeStatus.is_open })
      });
      const data = await response.json();
      if (!response.ok || typeof data.store?.is_open !== 'boolean') throw new Error(data.error || 'Não foi possível alterar o status da loja.');
      setStoreStatus(data.store);
      if (!data.store.is_open) { setIsCartModalOpen(false); void reservations.refresh(); }
      await fetchCakes(true);
      showToast(data.store.is_open ? 'Loja aberta! Sua vitrine está pronta para receber pedidos.' : 'Loja fechada. Você pode preparar o estoque e os sabores à vontade.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Não foi possível alterar o status da loja.', 'error');
    } finally { setStoreUpdating(false); }
  };

  const handleAdminLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setIsAdminAuthenticated(false);
    setCurrentView('catalog');
    sessionStorage.removeItem('delicias-current-view');
    fetchCakes(false);
  };

  const handleAddToCart = async (cake: Cake, quantity: number) => {
    if (await reservations.add(cake, quantity)) showToast(`Item "${cake.name}" adicionado à sua reserva.`, 'success');
  };
  const handleRemoveFromCart = (cakeId: number) => { void reservations.remove(cakeId); };
  const handleUpdateCartQuantity = (cakeId: number, qty: number) => { void reservations.update(cakeId, qty); };
  const handleOrderSuccess = (order: Order) => {
    reservations.clear();
    fetchCakes();
    showToast(`Reserva #${order.order_code} confirmada!`, 'success');
  };

  const totalCartCount = cart.filter(item => item.status !== 'expired').reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="min-h-screen bg-rose-50/80 text-slate-900 flex flex-col selection:bg-pink-200 selection:text-slate-900">
      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-18 left-3 right-3 sm:top-20 sm:left-auto sm:right-4 z-50 sm:max-w-sm"
          >
            <div
              role="status"
              aria-live="polite"
              className={`relative p-3.5 rounded-xl border shadow-xl flex items-center space-x-2.5 text-xs font-semibold ${
                toastMessage.type === 'success'
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                  : 'bg-red-50 border-red-300 text-red-800'
              }`}
            >
              {toastMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-400" />
              ) : (
                <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-400" />
              )}
              <span>{toastMessage.text}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navbar Superior */}
      <Navbar
        currentView={currentView}
        onViewChange={handleViewChange}
        cartCount={totalCartCount}
        onOpenCart={() => { if (storeStatus?.is_open) setIsCartModalOpen(true); }}
        storeStatus={storeStatus}
        onToggleStore={isAdminAuthenticated ? handleToggleStore : undefined}
        storeUpdating={storeUpdating}
        storeError={Boolean(storeLoadError)}
      />

      {currentView === 'admin' && isAdminAuthenticated && storeLoadError && (
        <div role="alert" className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
            <span>{storeLoadError}</span>
            <button type="button" onClick={() => { void fetchCakes(true); }} className="min-h-8 font-semibold underline">Tentar novamente</button>
          </div>
        </div>
      )}

      {/* Conteúdo Principal com Suavização de Tela Motion */}
      <main className="flex-1 pb-24 sm:pb-16">
        <AnimatePresence mode="wait">
          {currentView === 'catalog' ? (
            <motion.div
              key="catalog-view"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.25 }}
            >
              {isLoadingCakes ? (
                <div className="py-24 text-center text-slate-600 text-sm">
                  <div className="inline-block w-8 h-8 border-2 border-pink-400 border-t-transparent rounded-full animate-spin mb-3" />
                  <p>Aquecendo o forno e carregando os bolos caseiros...</p>
                </div>
              ) : !storeStatus ? (
                <div role="status" className="px-6 py-20 text-center text-sm text-slate-600">Não foi possível consultar a loja. Tentando novamente…</div>
              ) : !storeStatus.is_open ? <StoreClosed /> : (
                <div
                  className="relative min-h-full bg-rose-50/80"
                  style={{
                    backgroundImage: catalogWallpaper,
                    backgroundSize: '220px 220px'
                  }}
                >
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 hidden sm:block overflow-hidden text-4xl opacity-25"
                  >
                    {Array.from({ length: 30 }, (_, index) => (
                      <span
                        key={index}
                        className="absolute select-none grayscale-[15%] drop-shadow-sm"
                        style={{
                          left: `${(index * 37) % 94}%`,
                          top: `${(index * 53) % 96}%`,
                          transform: `rotate(${(index * 29) % 31 - 15}deg) scale(${0.75 + (index % 4) * 0.12})`
                        }}
                      >
                        {index % 2 === 0 ? '🧁' : '🍰'}
                      </span>
                    ))}
                  </div>
                  <div className="relative z-10">
                    <CakeCatalog
                      cakes={cakes}
                      cart={cart}
                      onAddToCart={handleAddToCart}
                      reservationBusy={reservations.busy}
                      pendingReservationId={reservations.pendingId}
                      onOpenCheckout={() => { if (storeStatus?.is_open) setIsCartModalOpen(true); }}
                    />
                  </div>
                </div>
              )}
            </motion.div>
          ) : isCheckingAdminSession ? (
            <div className="py-24 text-center text-slate-600 text-sm">Verificando sessão segura...</div>
          ) : !isAdminAuthenticated ? (
            <motion.div
              key="admin-login"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-md mx-auto mt-16 px-4"
            >
              <form onSubmit={handleAdminLogin} className="bg-white border border-violet-100 rounded-2xl p-6 shadow-lg space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-pink-100 text-pink-700 flex items-center justify-center">
                  <LockKeyhole className="w-6 h-6" />
                </div>
                <div>
                  <h1 className="text-2xl font-serif font-bold text-slate-900">Acesso administrativo</h1>
                  <p className="text-sm text-slate-600 mt-1">Área exclusiva da Delícias da Jú.</p>
                </div>
                <input
                  value={loginUser}
                  onChange={event => setLoginUser(event.target.value)}
                  placeholder="Usuário"
                  aria-label="Usuário administrativo"
                  autoComplete="username"
                  className="w-full min-h-11 sm:min-h-0 px-3 py-2.5 rounded-xl bg-violet-50 border border-violet-200 text-base sm:text-sm focus:outline-none focus:border-pink-400"
                />
                <input
                  type="password"
                  value={loginPassword}
                  onChange={event => setLoginPassword(event.target.value)}
                  placeholder="Senha"
                  aria-label="Senha administrativa"
                  autoComplete="current-password"
                  className="w-full min-h-11 sm:min-h-0 px-3 py-2.5 rounded-xl bg-violet-50 border border-violet-200 text-base sm:text-sm focus:outline-none focus:border-pink-400"
                />
                {loginError && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{loginError}</p>}
                <button className="w-full min-h-11 sm:min-h-0 py-3 rounded-xl bg-pink-600 hover:bg-pink-500 text-white font-semibold">Entrar</button>
              </form>
            </motion.div>
          ) : (
            <motion.div
              key="admin-view"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.25 }}
            >
              <AdminDashboard
                cakes={cakes}
                onRefreshCakes={() => fetchCakes(true)}
                onLogout={handleAdminLogout}
                onNotify={showToast}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Modal de finalização da reserva */}
      <OrderModal
        isOpen={isCartModalOpen}
        onClose={() => setIsCartModalOpen(false)}
        cart={cart}
        onRemoveItem={handleRemoveFromCart}
        onUpdateQuantity={handleUpdateCartQuantity}
        onOrderSuccess={handleOrderSuccess}
        reservationBusy={reservations.busy}
        reservationNow={reservations.now}
        reservationVersion={reservations.version}
        cartToken={reservations.token}
        onRenewItem={item => { void reservations.add(item.cake, item.quantity, true); }}
        onRefreshReservation={reservations.refresh}
      />

      {/* Rodapé Elegante */}
      <footer className="border-t border-violet-100 bg-white/60 py-4 sm:py-6 text-center text-sm sm:text-xs text-slate-600">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-center">
          <p>
            🍰 <strong className="text-pink-700 font-serif">Delícias da Jú</strong> — Bolos caseiros com estoque em tempo real e entrega no condomínio.
          </p>
        </div>
      </footer>
    </div>
  );
};
