import React from 'react';

export const StoreClosed: React.FC = () => (
  <section aria-labelledby="store-closed-title" className="mx-auto max-w-lg px-4 py-8 sm:py-14 text-center">
    <div className="relative overflow-hidden rounded-3xl border border-pink-100 bg-gradient-to-b from-white via-rose-50 to-violet-50 p-6 sm:p-9 shadow-sm">
      <div aria-hidden="true" className="relative mx-auto mb-5 flex h-36 w-48 items-end justify-center">
        <span className="absolute left-0 top-2 -rotate-12 text-3xl">🌙</span>
        <span className="absolute right-0 top-0 rotate-12 text-2xl">✨</span>
        <div className="relative rounded-t-[2rem] rounded-b-2xl border border-pink-200 bg-white p-4 shadow-sm">
          <img src="/assets/cake-card.svg" alt="" className="h-20 w-24 object-contain opacity-80" />
          <span className="absolute -right-3 top-1 text-xl">💤</span>
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-pink-200 bg-pink-100 px-3 py-1 text-[10px] font-bold tracking-widest text-pink-800">VOLTO JÁ</div>
        </div>
      </div>
      <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-white px-3 py-1 text-[10px] font-bold tracking-wider text-violet-700"><span className="h-1.5 w-1.5 rounded-full bg-violet-400" /> LOJA FECHADA</span>
      <h1 id="store-closed-title" className="mt-4 text-balance font-serif text-2xl font-bold leading-tight text-pink-900 sm:text-3xl">Nosso forninho está descansando!</h1>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">A Delícias da Jú está fechada no momento. Nossa vitrine faz uma pausinha, mas o carinho continua por aqui. <span aria-hidden="true">🧁💕</span></p>
      <p className="mt-4 rounded-2xl bg-white/80 px-4 py-3 text-xs leading-relaxed text-violet-800">Volte mais tarde para conferir os sabores disponíveis e adoçar o seu dia.</p>
    </div>
  </section>
);
