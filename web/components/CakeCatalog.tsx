import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Cake as CakeType, CartItem } from '../types';
import { ShoppingBag, Plus, Minus, Send, Sparkles, AlertTriangle, CheckCircle2, XCircle, Info } from 'lucide-react';

interface CakeCatalogProps {
  cakes: CakeType[];
  cart: CartItem[];
  onAddToCart: (cake: CakeType, quantity: number) => void;
  onOpenCheckout: () => void;
}

export const CakeCatalog: React.FC<CakeCatalogProps> = ({
  cakes,
  cart,
  onAddToCart,
  onOpenCheckout
}) => {
  const [selectedCategory, setSelectedCategory] = useState<CakeType['category']>('comum');
  const [selectedQuantities, setSelectedQuantities] = useState<Record<number, number>>({});
  const [openIngredients, setOpenIngredients] = useState<number | null>(null);

  const categories = [
    { id: 'comum', label: 'Comum' },
    { id: 'com_cobertura', label: 'Com cobertura' }
  ] as const;

  const categoryLabels: Record<CakeType['category'], string> = {
    comum: 'Comum',
    com_cobertura: 'Com cobertura'
  };

  const filteredCakes = cakes.filter(c => {
    return c.category === selectedCategory;
  });

  const handleQtyChange = (cakeId: number, delta: number, maxStock: number) => {
    const current = selectedQuantities[cakeId] || 1;
    const next = Math.max(1, Math.min(maxStock, current + delta));
    setSelectedQuantities(prev => ({ ...prev, [cakeId]: next }));
  };

  const getQty = (cakeId: number) => selectedQuantities[cakeId] || 1;

  const totalCartItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalCartValue = cart.reduce((sum, item) => sum + item.cake.price * item.quantity, 0);

  return (
    <div className="py-4 px-3 sm:py-8 sm:px-6 lg:px-8 max-w-7xl mx-auto font-sans">
      {/* Banner de Boas-Vindas e Identidade */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-pink-100/80 via-violet-50 to-sky-100/60 border border-pink-400/30 p-4 sm:p-8 text-slate-900 mb-4 sm:mb-8 shadow-sm sm:shadow-lg"
      >
        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-pink-500/20 text-pink-700 text-xs font-semibold mb-3 border border-pink-400/40">
            <Sparkles className="w-3.5 h-3.5" />
            <span className="sm:hidden">Fornadas do dia</span>
            <span className="hidden sm:inline">Fornadas do Dia • Produção Limitada</span>
          </div>
          <h1 className="text-xl sm:text-4xl font-serif font-bold text-pink-900 tracking-tight mb-2">
            Bolos Caseiros para Todos os Momentos
          </h1>
          <p className="text-slate-700 text-sm sm:text-base leading-relaxed mb-4">
            Na <span className="font-semibold text-pink-700">Delícias da Jú</span>, você encontra bolos caseiros comuns e com cobertura.
            Escolha o seu favorito e faça sua reserva em poucos passos.
          </p>

          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-stretch sm:items-center gap-2 sm:gap-3 text-xs text-slate-600">
            <div className="flex items-center space-x-1.5 bg-violet-50/80 px-2 sm:px-3 py-1.5 rounded-lg border border-violet-200">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Estoque visualizado em tempo real</span>
            </div>
            <div className="flex items-center space-x-1.5 bg-violet-50/80 px-2 sm:px-3 py-1.5 rounded-lg border border-violet-200">
              <Send className="w-3.5 h-3.5 text-sky-400" />
              <span>Entrega dentro do condomínio</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Filtros de Categoria */}
      <div className="flex items-center space-x-2 overflow-x-auto pb-2 sm:pb-4 mb-4 sm:mb-6 scrollbar-none" role="tablist" aria-label="Categorias de bolos">
        {categories.map(cat => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setSelectedCategory(cat.id)}
            role="tab"
            aria-selected={selectedCategory === cat.id}
            className={`min-h-11 sm:min-h-0 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
              selectedCategory === cat.id
                ? 'bg-pink-600 text-white shadow-md'
                : 'bg-violet-50/60 text-slate-700 hover:bg-violet-50 hover:text-slate-900 border border-violet-200/60'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Grid de Bolos com Motion */}
      <motion.div
        layout
        className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4"
      >
        {filteredCakes.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="sm:col-span-2 lg:col-span-3 rounded-2xl border border-pink-200 bg-gradient-to-br from-pink-50 via-violet-50 to-sky-50 px-6 py-12 text-center shadow-sm"
          >
            <div className="mb-3 text-5xl" aria-hidden="true">🍰💗✨</div>
            <h2 className="mb-2 font-serif text-2xl font-bold text-pink-800">
              O forninho está descansando!
            </h2>
            <p className="mx-auto max-w-md text-sm leading-relaxed text-slate-600">
              Ainda não temos bolos disponíveis nesta categoria.
              Volte daqui a pouquinho — uma nova fornada pode aparecer. 🧁
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
                className="mobile-cake-card flex flex-col bg-white/90 rounded-xl border border-violet-100 overflow-hidden shadow-sm hover:border-pink-400/30 transition-all group"
              >
                {/* Imagem do bolo com indicador de estoque */}
                <div className="mobile-cake-image relative h-20 w-full flex-shrink-0 sm:h-36 overflow-hidden bg-rose-50">
                  <img
                    src={cake.image_url || '/assets/cake-card.svg'}
                    alt={cake.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    decoding="async"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-stone-950/80 via-transparent to-transparent" />

                  {/* Categoria */}
                  <span className="hidden sm:inline absolute top-3 left-3 px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide uppercase bg-white/80 backdrop-blur-md text-pink-700 border border-violet-200">
                    {categoryLabels[cake.category]}
                  </span>

                  {/* Indicador de estoque */}
                  <div className="absolute bottom-2 left-1.5 right-1.5 sm:bottom-auto sm:left-auto sm:top-3 sm:right-3">
                    {isOutOfStock ? (
                      <span className="flex items-center justify-center space-x-1 px-1.5 sm:px-2.5 py-1 rounded-lg sm:rounded-full text-[11px] sm:text-xs font-bold bg-red-50/95 text-red-700 border border-red-200 sm:backdrop-blur-md shadow-sm">
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Esgotado</span>
                      </span>
                    ) : isLowStock ? (
                      <span className="flex items-center justify-center space-x-1 px-1.5 sm:px-2.5 py-1 rounded-lg sm:rounded-full text-[11px] sm:text-xs font-bold bg-pink-100/90 text-pink-800 border border-pink-400/80 sm:backdrop-blur-md shadow-sm sm:animate-pulse">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>Restam {cake.stock_quantity} un!</span>
                      </span>
                    ) : (
                      <span className="flex items-center justify-center space-x-1 px-1.5 sm:px-2.5 py-1 rounded-lg sm:rounded-full text-[11px] sm:text-xs font-semibold bg-emerald-50/95 text-emerald-700 border border-emerald-200 sm:backdrop-blur-md shadow-sm">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{cake.stock_quantity} un disponíveis</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Conteúdo e Informações */}
                <div className="relative min-w-0 p-2 sm:p-4 flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="line-clamp-2 pr-7 sm:line-clamp-none sm:pr-0 text-sm sm:text-base font-serif font-bold text-slate-900 mb-0.5 sm:mb-1 leading-snug">
                      {cake.name}
                    </h3>
                    <p className="hidden sm:line-clamp-2 text-slate-600 sm:text-xs sm:leading-relaxed sm:mb-3">
                      {cake.description}
                    </p>
                    <button
                      type="button"
                      onClick={() => setOpenIngredients(openIngredients === cake.id ? null : cake.id)}
                      aria-expanded={openIngredients === cake.id}
                      aria-label={openIngredients === cake.id ? `Ocultar ingredientes de ${cake.name}` : `Ver ingredientes de ${cake.name}`}
                      className="absolute right-1.5 top-1.5 flex min-h-7 min-w-7 items-center justify-center rounded-full text-pink-700 hover:bg-pink-50 hover:text-pink-900 sm:static sm:mb-3 sm:min-h-0 sm:min-w-0 sm:inline sm:rounded-none sm:text-[11px] sm:font-semibold sm:underline-offset-2 sm:hover:bg-transparent sm:hover:underline"
                    >
                      <Info className="h-4 w-4 sm:hidden" aria-hidden="true" />
                      <span className="hidden sm:inline">{openIngredients === cake.id ? 'Ocultar ingredientes' : 'Ver ingredientes'}</span>
                    </button>
                    {openIngredients === cake.id && (
                      <div className="mb-1.5 rounded-lg bg-rose-50 px-2 py-1 text-[11px] sm:mb-3 sm:px-3 sm:py-2 sm:text-[11px] text-slate-600 break-words">
                        {cake.ingredients.length > 0 ? cake.ingredients.join(', ') : 'Ingredientes ainda não informados.'}
                      </div>
                    )}
                  </div>

                  <div className="pt-2 sm:pt-3 border-t border-violet-100">
                    <div className="flex flex-row items-baseline justify-between gap-1 mb-1 sm:mb-3">
                      <span className="sr-only sm:not-sr-only sm:text-[10px] text-slate-600">Preço unitário:</span>
                      <span className="text-base sm:text-lg font-bold font-serif text-pink-600 whitespace-nowrap">
                        R$ {cake.price.toFixed(2).replace('.', ',')}
                      </span>
                    </div>

                    {/* Ações de Quantidade e Adição */}
                    {isOutOfStock ? (
                      <div className="w-full py-2.5 px-4 rounded-xl bg-violet-50/80 text-slate-500 text-center text-xs font-semibold border border-violet-200/50">
                        Forno vazio para hoje
                      </div>
                    ) : (
                       <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-1 sm:gap-2">
                        {/* Seletor de Quantidade */}
                        <div className="flex h-9 items-center justify-between sm:h-auto sm:justify-start bg-violet-50 rounded-lg sm:rounded-xl border border-violet-200 p-0.5 sm:p-1">
                          <button
                            type="button"
                            onClick={() => handleQtyChange(cake.id, -1, cake.stock_quantity)}
                            aria-label={`Diminuir quantidade de ${cake.name}`}
                            className="min-h-8 min-w-8 sm:min-h-0 sm:min-w-0 p-1 sm:p-1.5 rounded-md sm:rounded-lg text-slate-600 hover:text-slate-900 hover:bg-violet-100 transition-colors disabled:opacity-30"
                            disabled={currentQty <= 1}
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="w-6 sm:w-8 text-center text-xs font-bold text-slate-800">
                            {currentQty}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleQtyChange(cake.id, 1, cake.stock_quantity)}
                            aria-label={`Aumentar quantidade de ${cake.name}`}
                            className="min-h-8 min-w-8 sm:min-h-0 sm:min-w-0 p-1 sm:p-1.5 rounded-md sm:rounded-lg text-slate-600 hover:text-slate-900 hover:bg-violet-100 transition-colors disabled:opacity-30"
                            disabled={currentQty >= cake.stock_quantity}
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Botão de adicionar ao carrinho */}
                        <button
                          type="button"
                          id={`btn-add-cake-${cake.id}`}
                          onClick={() => onAddToCart(cake, currentQty)}
                          className="min-h-10 sm:min-h-0 flex-1 py-2 sm:py-2.5 px-2 sm:px-3 rounded-lg sm:rounded-xl bg-pink-600 hover:bg-pink-500 active:scale-98 text-white text-xs font-semibold transition-all flex items-center justify-center space-x-1.5 shadow-md"
                        >
                          <ShoppingBag className="w-4 h-4" />
                          <span className="sm:hidden">Adicionar</span>
                          <span className="hidden sm:inline">Adicionar ao carrinho</span>
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
            <div className="max-w-xl mx-auto bg-white border border-pink-400/50 rounded-t-2xl sm:rounded-2xl p-3 sm:p-4 shadow-2xl flex items-center justify-between pointer-events-auto sm:backdrop-blur-md">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-pink-500/20 text-pink-600 flex items-center justify-center border border-pink-400/40">
                  <ShoppingBag className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs text-slate-600">
                    {totalCartItems} {totalCartItems === 1 ? 'bolo selecionado' : 'bolos selecionados'}
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
                className="min-h-11 sm:min-h-0 py-2.5 px-4 sm:px-5 rounded-xl bg-gradient-to-r from-pink-600 to-violet-500 hover:from-pink-500 hover:to-violet-400 active:scale-95 text-white text-sm font-semibold transition-all flex items-center space-x-2 shadow-lg cursor-pointer"
              >
                <Send className="w-4 h-4 text-sky-200" />
                <span>Finalizar pedido</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
