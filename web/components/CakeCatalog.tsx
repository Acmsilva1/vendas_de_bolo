import { ITEM_CATEGORIES } from '../../shared/categories';
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Cake as CakeType, CartItem } from '../types';
import { ShoppingBag, Plus, Minus, Send, Sparkles, AlertTriangle, CheckCircle2, XCircle, Info, CakeSlice, Banknote, Motorbike } from 'lucide-react';

interface CakeCatalogProps {
  cakes: CakeType[];
  cart: CartItem[];
  onAddToCart: (cake: CakeType, quantity: number) => void;
  onOpenCheckout: () => void;
  reservationBusy?: boolean;
  pendingReservationId?: number | null;
}

export const CakeCatalog: React.FC<CakeCatalogProps> = ({
  cakes,
  cart,
  onAddToCart,
  onOpenCheckout, reservationBusy = false, pendingReservationId
}) => {
  const [selectedCategory, setSelectedCategory] = useState<CakeType['category']>('comum');
  const [selectedQuantities, setSelectedQuantities] = useState<Record<number, number>>({});
  const [openIngredients, setOpenIngredients] = useState<number | null>(null);

  const categories = ITEM_CATEGORIES;

  const filteredCakes = cakes.filter(c => {
    return c.category === selectedCategory;
  });

  const handleQtyChange = (cakeId: number, delta: number, maxStock: number) => {
    const current = selectedQuantities[cakeId] || 1;
    const next = Math.max(1, Math.min(maxStock, current + delta));
    setSelectedQuantities(prev => ({ ...prev, [cakeId]: next }));
  };

  const getQty = (cakeId: number) => selectedQuantities[cakeId] || 1;

  const totalCartItems = cart.filter(item => item.status !== 'expired').reduce((sum, item) => sum + item.quantity, 0);
  const totalCartValue = cart.filter(item => item.status !== 'expired').reduce((sum, item) => sum + item.cake.price * item.quantity, 0);

  return (
    <div className="catalog-shell min-w-0 py-3 px-3 sm:py-8 sm:px-6 lg:px-8 max-w-7xl mx-auto font-sans">
      {/* Banner de Boas-Vindas e Identidade */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-white via-pink-50 to-violet-50 border border-pink-100 p-4 sm:p-8 text-slate-900 mb-3 sm:mb-8 shadow-sm"
      >
        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-pink-500/20 text-pink-700 text-xs font-semibold mb-3 border border-pink-400/40">
            <Sparkles className="w-3.5 h-3.5" />
            <span className="sm:hidden">Fornadas do dia</span>
            <span className="hidden sm:inline">Fornadas do Dia • Produção Limitada</span>
          </div>
          <h1 className="max-w-xl text-balance text-[22px] leading-tight sm:text-4xl font-serif font-bold text-pink-900 tracking-tight mb-2 sm:mb-3">
            Bolos Caseiros para Todos os Momentos
          </h1>
          <p className="text-slate-700 text-sm sm:text-base leading-relaxed mb-3 sm:mb-4">
            Escolha seu favorito na <span className="font-semibold text-pink-700">Delícias da Jú</span> e reserve para receber no condomínio.
          </p>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-[11px] sm:text-xs text-slate-600">
            <div className="flex items-center space-x-1.5 bg-violet-50/80 px-2 sm:px-3 py-1.5 rounded-lg border border-violet-200">
              <Banknote className="w-3.5 h-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
              <span>PIX ou DEBITO / CREDITO (por aproximação)</span>
            </div>
            <div className="flex items-center space-x-1.5 bg-violet-50/80 px-2 sm:px-3 py-1.5 rounded-lg border border-violet-200">
              <Motorbike className="w-3.5 h-3.5 shrink-0 text-sky-600" aria-hidden="true" />
              <span>Entregas no condomínio</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Filtros de Categoria */}
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-3 mb-3 sm:mb-6" role="tablist" aria-label="Categorias de itens">
        {categories.map(cat => {
          const cardCount = cakes.filter(cake => cake.category === cat.id).length;
          return (
          <button
            key={cat.id}
            type="button"
            onClick={() => setSelectedCategory(cat.id)}
            role="tab"
            aria-selected={selectedCategory === cat.id}
            className={`inline-flex items-center justify-center gap-1 min-h-9 sm:min-h-11 border px-2 sm:px-5 py-1.5 sm:py-2 rounded-full text-[11px] sm:text-sm font-semibold transition-colors ${
              selectedCategory === cat.id
                ? 'border-pink-600 bg-pink-600 text-white shadow-sm'
                : 'border-pink-200 bg-white text-slate-600 hover:bg-pink-50 hover:text-pink-800'
            }`}
          >
            <span>{cat.label}</span>
            <span className="tabular-nums">({cardCount})</span>
          </button>
          );
        })}
      </div>

      {/* Grid de Bolos com Motion */}
      <motion.div
        layout
        className="catalog-grid grid grid-cols-1 min-[360px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-4"
      >
        {filteredCakes.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="catalog-empty col-span-full min-w-0 rounded-2xl border border-pink-100 bg-white/90 px-4 py-6 sm:px-8 sm:py-14 text-center shadow-sm"
          >
            <div className="mx-auto mb-3 sm:mb-5 flex h-12 w-12 sm:h-16 sm:w-16 items-center justify-center rounded-2xl bg-pink-50 text-pink-600" aria-hidden="true">
              <CakeSlice className="h-6 w-6 sm:h-8 sm:w-8" strokeWidth={1.5} />
            </div>
            <h2 className="mx-auto mb-3 max-w-sm text-balance font-serif text-xl leading-snug sm:text-2xl font-bold text-pink-900">
              O forninho está descansando!
            </h2>
            <p className="mx-auto max-w-md text-sm leading-relaxed text-slate-600">
              Ainda não temos itens disponíveis nesta categoria. Confira novamente em breve.
            </p>
          </motion.div>
        ) : (
        <AnimatePresence>
          {filteredCakes.map(cake => {
            const currentQty = getQty(cake.id);
            const isOutOfStock = cake.stock_quantity <= 0;
            const isLowStock = cake.stock_quantity > 0 && cake.stock_quantity <= 2;
            return (
              <motion.div
                key={cake.id}
                layout
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.25 }}
                className="mobile-cake-card min-w-0 flex flex-col bg-white rounded-xl border border-pink-100 overflow-hidden shadow-sm hover:border-pink-300 transition-colors group"
              >
                {/* Imagem do bolo com indicador de estoque */}
                <div className="mobile-cake-image relative h-16 w-full flex-shrink-0 sm:h-24 overflow-hidden bg-rose-50">
                  <img
                    src={cake.image_url || '/assets/cake-card.svg'}
                    alt={cake.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    decoding="async"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-stone-950/80 via-transparent to-transparent" />

                  {/* Indicador de estoque */}
                  <div className="absolute bottom-1.5 left-1.5 right-1.5 sm:left-auto sm:right-2">
                    {isOutOfStock ? (
                      <span className="flex items-center justify-center space-x-1 px-1.5 py-0.5 rounded-md sm:rounded-full text-[9px] sm:text-[11px] font-bold bg-red-50/95 text-red-700 border border-red-200 sm:backdrop-blur-md shadow-sm">
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Esgotado</span>
                      </span>
                    ) : isLowStock ? (
                      <span className="flex items-center justify-center space-x-1 px-1.5 py-0.5 rounded-md sm:rounded-full text-[9px] sm:text-[11px] font-bold bg-pink-100/90 text-pink-800 border border-pink-400/80 sm:backdrop-blur-md shadow-sm ">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>Restam {cake.stock_quantity} un!</span>
                      </span>
                    ) : (
                      <span className="flex items-center justify-center space-x-1 px-1.5 py-0.5 rounded-md sm:rounded-full text-[9px] sm:text-[11px] font-semibold bg-emerald-50/95 text-emerald-700 border border-emerald-200 sm:backdrop-blur-md shadow-sm">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{cake.stock_quantity} disponíveis</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Conteúdo e Informações */}
                <div className="relative min-w-0 p-1.5 sm:p-2.5 flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="line-clamp-2 break-words pr-7 text-xs sm:text-sm font-serif font-bold text-slate-900 mb-1 leading-snug">
                      {cake.name}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setOpenIngredients(openIngredients === cake.id ? null : cake.id)}
                      aria-expanded={openIngredients === cake.id}
                      aria-label={openIngredients === cake.id ? `Ocultar ingredientes de ${cake.name}` : `Ver ingredientes de ${cake.name}`}
                      className="absolute right-0.5 top-0.5 flex min-h-8 min-w-8 items-center justify-center rounded-full text-pink-700 hover:bg-pink-50 hover:text-pink-900"
                    >
                      <Info className="h-3.5 w-3.5" aria-hidden="true" />

                    </button>
                    {openIngredients === cake.id && (
                      <div className="mb-1.5 rounded-lg bg-rose-50 px-2 py-1 text-[10px] sm:text-[11px] sm:px-2 sm:py-1.5 text-slate-600 break-words">
                        {cake.ingredients.length > 0 ? cake.ingredients.join(', ') : 'Ingredientes ainda não informados.'}
                      </div>
                    )}
                  </div>

                  <div className="pt-1 sm:pt-1.5 border-t border-violet-100">
                    <div className="flex flex-row items-baseline justify-between gap-1 mb-1 sm:mb-1.5">
                      <span className="sr-only">Preço unitário:</span>
                      <span className="text-sm sm:text-base font-bold font-serif text-pink-600 whitespace-nowrap">
                        R$ {cake.price.toFixed(2).replace('.', ',')}
                      </span>
                    </div>

                    {/* Ações de Quantidade e Adição */}
                    {isOutOfStock ? (
                      <div className="w-full py-2 sm:py-2.5 px-1.5 sm:px-4 rounded-xl bg-violet-50/80 text-slate-500 text-center text-[10px] sm:text-xs font-semibold border border-violet-200/50">
                        Indisponível no momento
                      </div>
                    ) : (
                       <div className="catalog-card-controls flex flex-row items-stretch gap-1 sm:gap-1.5">
                        {/* Seletor de Quantidade */}
                        <div className="catalog-quantity-picker flex w-[3.75rem] h-7 sm:h-9 shrink-0 items-center justify-between bg-violet-50 rounded-lg border border-violet-200 p-0 sm:p-0.5 sm:w-24">
                          <button
                            type="button"
                            onClick={() => handleQtyChange(cake.id, -1, cake.stock_quantity)}
                            aria-label={`Diminuir quantidade de ${cake.name}`}
                            className="min-h-6 sm:min-h-8 w-5 sm:w-8 shrink-0 flex items-center justify-center sm:p-1 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-violet-100 transition-colors disabled:opacity-30"
                            disabled={currentQty <= 1}
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="min-w-0 flex-1 text-center text-[10px] sm:text-xs font-bold text-slate-800">
                            {currentQty}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleQtyChange(cake.id, 1, cake.stock_quantity)}
                            aria-label={`Aumentar quantidade de ${cake.name}`}
                            className="min-h-6 sm:min-h-8 w-5 sm:w-8 shrink-0 flex items-center justify-center sm:p-1 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-violet-100 transition-colors disabled:opacity-30"
                            disabled={currentQty >= cake.stock_quantity}
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Botão de adicionar ao carrinho */}
                        <button
                          type="button"
                          id={`btn-add-cake-${cake.id}`}
                          aria-label={`Adicionar ${cake.name} ao carrinho`}
                          onClick={() => onAddToCart(cake, currentQty)}
                          disabled={reservationBusy}
                          className="min-w-0 min-h-7 sm:min-h-9 flex-1 py-1 sm:py-1.5 px-1 sm:px-2 rounded-lg bg-pink-600 hover:bg-pink-500 active:scale-98 text-white text-[10px] sm:text-xs font-semibold transition-all flex items-center justify-center sm:space-x-1.5 shadow-sm"
                        >
                          <ShoppingBag className="hidden sm:block w-4 h-4 shrink-0" />
                          <span className="truncate">{pendingReservationId === cake.id ? 'Reservando...' : 'Adicionar'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
        )}
      </motion.div>

      {/* Barra Flutuante de Checkout se houver itens no carrinho */}
      <AnimatePresence>
        {totalCartItems > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-0 sm:bottom-6 left-0 right-0 z-30 px-2 sm:px-4 pb-[env(safe-area-inset-bottom)] sm:pb-0 pointer-events-none"
          >
            <div className="max-w-xl mx-auto bg-white border border-pink-200 rounded-t-2xl sm:rounded-2xl p-3 sm:p-4 shadow-xl flex items-center justify-between gap-3 pointer-events-auto sm:backdrop-blur-md">
              <div className="flex min-w-0 items-center gap-3">
                <div className="hidden sm:flex w-10 h-10 shrink-0 rounded-xl bg-pink-500/20 text-pink-600 items-center justify-center border border-pink-400/40">
                  <ShoppingBag className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs text-slate-600">
                    {totalCartItems} {totalCartItems === 1 ? 'item selecionado' : 'itens selecionados'}
                  </div>
                  <div className="text-lg font-serif font-bold text-pink-700">
                    R$ {totalCartValue.toFixed(2).replace('.', ',')}
                  </div>
                </div>
              </div>

              <button
                type="button"
                id="btn-finalize-order-floating"
                onClick={onOpenCheckout}
                className="min-h-9 sm:min-h-11 shrink-0 py-1.5 sm:py-2.5 px-3 sm:px-5 rounded-xl bg-pink-600 hover:bg-pink-500 active:scale-95 text-white text-sm font-semibold transition-all flex items-center space-x-2 shadow-sm cursor-pointer"
              >
                <Send className="w-4 h-4 text-sky-200" />
                <span className="sm:hidden">Ver pedido</span>
                <span className="hidden sm:inline">Finalizar pedido</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
