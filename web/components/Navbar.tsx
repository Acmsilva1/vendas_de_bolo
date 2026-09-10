import React, { useEffect, useState } from 'react';
import { Cake, ShoppingCart, ShieldCheck } from 'lucide-react';

interface NavbarProps {
  currentView: 'catalog' | 'admin';
  onViewChange: (view: 'catalog' | 'admin') => void;
  cartCount: number;
  onOpenCart: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  onViewChange,
  cartCount,
  onOpenCart
}) => {
  const [brasiliaTime, setBrasiliaTime] = useState(() => new Date());

  useEffect(() => {
    if (!window.matchMedia('(min-width: 1024px)').matches) return;
    const clockInterval = window.setInterval(() => setBrasiliaTime(new Date()), 1000);
    return () => window.clearInterval(clockInterval);
  }, []);

  const formattedBrasiliaTime = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'medium'
  }).format(brasiliaTime);

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-violet-100 text-slate-900 shadow-sm">
      <div className="max-w-7xl mx-auto px-2 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-18 gap-2">
          {/* Logo & Marca Delícias da Jú */}
          <button type="button" className="flex min-w-0 items-center space-x-2 sm:space-x-3 cursor-pointer text-left" onClick={() => onViewChange('catalog')} aria-label="Ir para o cardápio">
            <div className="mobile-brand-icon w-10 h-10 sm:w-11 sm:h-11 flex-shrink-0 rounded-xl bg-pink-500/20 border border-pink-400/40 flex items-center justify-center text-pink-600 shadow-inner">
              <Cake className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-2">
                <span className="font-serif text-base sm:text-2xl font-bold tracking-tight text-pink-800 whitespace-nowrap">
                  Delícias da Jú
                </span>
                <span className="hidden sm:inline text-xs uppercase tracking-wider px-2 py-0.5 rounded-full bg-pink-500/20 text-pink-700 border border-pink-400/30">
                  Caseiro
                </span>
              </div>
              <p className="hidden sm:block text-xs text-slate-600 font-sans">
                Bolos Caseiros • Comuns e com Cobertura
              </p>
            </div>
          </button>

          {/* Navegação entre Visão de Cliente e Admin */}
          <div className="flex flex-shrink-0 items-center space-x-1 sm:space-x-3">
            <time
              dateTime={brasiliaTime.toISOString()}
              className="hidden lg:block px-3 py-2 rounded-xl bg-pink-50 border border-pink-200 text-sm font-bold text-pink-700 whitespace-nowrap shadow-sm"
            >
              {formattedBrasiliaTime}
            </time>
            <div className="flex bg-violet-50/90 p-0.5 sm:p-1 rounded-xl border border-violet-200/80">
              <button
                type="button"
                id="btn-nav-catalog"
                onClick={() => onViewChange('catalog')}
                aria-current={currentView === 'catalog' ? 'page' : undefined}
                aria-label="Cardápio"
                className={`min-h-11 min-w-11 justify-center px-2 sm:min-h-0 sm:min-w-0 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-lg transition-all flex items-center sm:space-x-1.5 ${
                  currentView === 'catalog'
                    ? 'bg-pink-600 text-white shadow-md'
                    : 'text-slate-700 hover:text-slate-900 hover:bg-violet-100/60'
                }`}
              >
                <Cake className="w-4 h-4" />
                <span className="sr-only sm:not-sr-only">Cardápio</span>
              </button>

              <button
                type="button"
                id="btn-nav-admin"
                onClick={() => onViewChange('admin')}
                aria-current={currentView === 'admin' ? 'page' : undefined}
                aria-label="Painel administrativo"
                className={`min-h-11 min-w-11 justify-center px-2 sm:min-h-0 sm:min-w-0 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-lg transition-all flex items-center sm:space-x-1.5 ${
                  currentView === 'admin'
                    ? 'bg-pink-600 text-white shadow-md'
                    : 'text-slate-700 hover:text-slate-900 hover:bg-violet-100/60'
                }`}
              >
                <ShieldCheck className="w-4 h-4" />
                <span className="sr-only sm:not-sr-only">Painel Admin</span>
              </button>
            </div>

            {/* Botão do carrinho (Apenas visível no catálogo) */}
            {currentView === 'catalog' && (
              <button
                type="button"
                id="btn-nav-cart"
                onClick={onOpenCart}
                aria-label={cartCount > 0 ? `Abrir carrinho com ${cartCount} itens` : 'Abrir carrinho'}
                className="relative min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 justify-center p-2.5 rounded-xl bg-pink-500/15 border border-pink-400/30 text-pink-700 hover:bg-pink-500/25 transition-colors flex items-center space-x-2"
              >
                <ShoppingCart className="w-5 h-5" />
                <span className="hidden md:inline text-xs font-semibold">Carrinho</span>
                {cartCount > 0 && (
                  <span className="absolute -right-1 -top-1 sm:static inline-flex min-w-5 items-center justify-center px-1.5 sm:px-2 py-0.5 text-[11px] sm:text-xs font-bold leading-none text-slate-900 bg-pink-400 rounded-full">
                    {cartCount}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
