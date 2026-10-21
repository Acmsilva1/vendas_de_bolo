import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CartItem, Order } from '../types';
import { reservationClock } from '../reservations';
import { pendingOrderKey, clearPendingOrder } from '../orderRequest';
import { createOrderPdf } from '../orderPdf';
import { X, Send, ShoppingCart, Trash2, CheckCircle, MapPin, Phone, User, FileText, Download, CreditCard, Copy, Minus, Plus, ArrowLeft } from 'lucide-react';

interface OrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  cart: CartItem[];
  onRemoveItem: (cakeId: number) => void;
  onUpdateQuantity: (cakeId: number, qty: number) => void;
  onOrderSuccess: (order: Order) => void;
  reservationBusy?: boolean;
  reservationNow?: number;
  reservationVersion?: number;
  cartToken?: string;
  onRenewItem?: (item: CartItem) => void;
  onRefreshReservation?: () => Promise<void>;
}

const PIX_KEY = '11738647765';

function crc16Ccitt(value: string): string {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(value)) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function pixField(id: string, value: string): string {
  return `${id}${value.length.toString().padStart(2, '0')}${value}`;
}

function createPixCopyPaste(total: number): string {
  const merchantAccount = pixField('00', 'BR.GOV.BCB.PIX') + pixField('01', PIX_KEY);
  const payload = [
    pixField('00', '01'),
    pixField('26', merchantAccount),
    pixField('52', '0000'),
    pixField('53', '986'),
    pixField('54', total.toFixed(2)),
    pixField('58', 'BR'),
    pixField('59', 'DELICIAS DA JU'),
    pixField('60', 'VITORIA'),
    pixField('62', pixField('05', 'PEDIDO'))
  ].join('');
  return `${payload}6304${crc16Ccitt(`${payload}6304`)}`;
}

export const OrderModal: React.FC<OrderModalProps> = ({
  isOpen,
  onClose,
  cart,
  onRemoveItem,
  onUpdateQuantity,
  onOrderSuccess, reservationBusy = false, reservationNow = Date.now(), reservationVersion = 0, cartToken = '', onRenewItem, onRefreshReservation
}) => {
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryBlock, setDeliveryBlock] = useState('');
  const [deliveryApartment, setDeliveryApartment] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'credito'>('credito');
  const [pixCopied, setPixCopied] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [retryUncertain, setRetryUncertain] = useState(false);
  const [submittedOrder, setSubmittedOrder] = useState<Order | null>(null);
  const [mobileStep, setMobileStep] = useState<1 | 2>(1);
  const requestRef = useRef<{ payload: string; key: string; token: string } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const handleResetAndClose = useCallback(() => {
    if (requestRef.current) { onClose(); return; }
    setSubmittedOrder(null);
    setCustomerName('');
    setCustomerPhone('');
    setDeliveryBlock('');
    setDeliveryApartment('');
    setNotes('');
    setPaymentMethod('credito');
    setPixCopied(false);
    setErrorMessage('');
    setMobileStep(1);
    onClose();
  }, [onClose]);

  const closeHandlerRef = useRef(handleResetAndClose);
  closeHandlerRef.current = handleResetAndClose;

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = 'hidden';
    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeHandlerRef.current();
        return;
      }

      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable: HTMLElement[] = [];
      dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ).forEach(element => {
        if (element.offsetParent !== null) focusable.push(element);
      });
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!cart.some(item => item.status !== 'expired')) setMobileStep(1);
  }, [cart]);

  if (!isOpen) return null;

  const activeCart = cart.filter(item => item.status !== 'expired');
  const totalAmount = activeCart.reduce((sum, item) => sum + item.cake.price * item.quantity, 0);
  const emptyCartTips = [
    'Que tal experimentar o Bolo de Fubá? É simples, caseiro e combina com qualquer café.',
    'O Bolo de Laranja é uma escolha leve e perfumada para adoçar o dia.',
    'Complete seu pedido com uma cobertura avulsa ou uma sobremesa.',
    'Comece pelo seu sabor favorito e monte seu pedido do jeitinho que quiser.'
  ];
  const emptyCartTip = emptyCartTips[Math.floor(Date.now() / 60000) % emptyCartTips.length];

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    const recovering = Boolean(retryUncertain && requestRef.current);
    if (!recovering && (!customerName.trim() || !customerPhone.trim())) {
      setErrorMessage('Por favor, informe seu nome e telefone para contato.');
      return;
    }

    const phoneDigits = customerPhone.replace(/\D/g, '');
    if (!recovering && !/^27\d{8,9}$/.test(phoneDigits)) {
      setErrorMessage('Informe um WhatsApp válido do Espírito Santo com DDD 27.');
      return;
    }

    if (!recovering && (!deliveryBlock.trim() || !deliveryApartment.trim())) {
      setErrorMessage('Por favor, informe o bloco e o apartamento.');
      return;
    }

    if (reservationBusy || isLoading) return;
    if (activeCart.length === 0 && !requestRef.current) {
      setErrorMessage('Nenhum item com reserva ativa. Volte à sacola para reservar novamente.');
      return;
    }

    setIsLoading(true);

    try {
      const payload = {
        customer_name: customerName.trim(),
        customer_phone: phoneDigits,
        delivery_block: deliveryBlock.trim(),
        delivery_apartment: deliveryApartment.trim(),
        notes: notes.trim(),
        payment_method: paymentMethod,
        reservation_version: reservationVersion,
        items: activeCart.map(item => ({
          cake_id: item.cake.id,
          quantity: item.quantity
        }))
      };

      if (!recovering) {
        const body = JSON.stringify(payload);
        const key = await pendingOrderKey(body);
        requestRef.current = { payload: body, key, token: cartToken };
      }
      const { payload: body, key, token: requestToken } = requestRef.current!;
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key, 'X-Cart-Token': requestToken },
        body
      });

      const data = await res.json();

      if (!res.ok || !data.order) {
        if (res.status >= 400 && res.status < 500) { requestRef.current = null; clearPendingOrder(); }
        throw new Error(data.error || 'Falha ao registrar pedido.');
      }

      requestRef.current = null;
      clearPendingOrder();
      setRetryUncertain(false);
      setSubmittedOrder(data.order);
      onOrderSuccess(data.order);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao processar pedido.';
      setErrorMessage(msg);
      setRetryUncertain(Boolean(requestRef.current));
      void onRefreshReservation?.();
    } finally {
      setIsLoading(false);
    }
  };

  const pixCopyPaste = submittedOrder ? createPixCopyPaste(submittedOrder.total_amount) : '';

  const handleCopyPix = async () => {
    if (!pixCopyPaste) return;
    await navigator.clipboard.writeText(pixCopyPaste);
    setPixCopied(true);
  };

  const handleDownloadPdf = () => {
    if (!submittedOrder) return;

    const url = URL.createObjectURL(new Blob([createOrderPdf(submittedOrder)], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `reserva-${submittedOrder.order_code.replace(/[^a-zA-Z0-9_-]/g, '') || submittedOrder.id}-delicias-da-ju.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-violet-950/35 sm:backdrop-blur-sm">
      <motion.div
        ref={dialogRef}
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-modal-title"
        className="flex max-h-[94dvh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-violet-100 bg-white text-slate-900 shadow-2xl"
      >
        {/* Cabeçalho do Modal */}
        <div className="flex items-center justify-between shrink-0 p-3 sm:px-4 border-b border-violet-100 bg-rose-50/60">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-pink-500/20 text-pink-600 border border-pink-400/30">
              <ShoppingCart className="w-5 h-5" />
            </div>
            <div>
              <h2 id="order-modal-title" className="text-lg font-serif font-bold text-pink-800">
                {submittedOrder ? 'Reserva confirmada!' : 'Finalizar Pedido'}
              </h2>
              <p className="text-xs text-slate-600">
                {submittedOrder
                  ? 'Seu pedido já foi enviado ao vendedor'
                  : 'Delícias da Jú • Bolos Caseiros'}
              </p>
            </div>
          </div>

          <button
            ref={closeButtonRef}
            type="button"
            onClick={handleResetAndClose}
            aria-label="Fechar finalização do pedido"
            className="min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-violet-50 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {!submittedOrder && cart.length > 0 && (
          <div className="flex items-center gap-2 border-b border-violet-100 px-4 py-2 text-xs" aria-label={`Etapa ${mobileStep} de 2`}>
            <span className={`h-2 flex-1 rounded-full ${mobileStep >= 1 ? 'bg-pink-600' : 'bg-violet-100'}`} />
            <span className={`h-2 flex-1 rounded-full ${mobileStep >= 2 ? 'bg-pink-600' : 'bg-violet-100'}`} />
            <span className="ml-1 font-semibold text-slate-700">{mobileStep}/2</span>
          </div>
        )}

        {/* Corpo do Modal */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4">
          {/* Tela de sucesso da reserva */}
          {submittedOrder ? (
            <div className="space-y-5 text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 mx-auto flex items-center justify-center">
                <CheckCircle className="w-8 h-8" />
              </div>

              <div>
                <span className="text-xs uppercase tracking-wider font-semibold text-pink-600">
                  Tudo certo com sua reserva
                </span>
                <h3 className="text-2xl font-serif font-bold text-slate-900 mt-1">
                  Pedido recebido!
                </h3>
                <p className="text-xs text-slate-600 mt-1">
                  Recebemos {submittedOrder.items.length} sabor(es) • Total: <span className="font-bold text-pink-700">R$ {submittedOrder.total_amount.toFixed(2).replace('.', ',')}</span>
                </p>
              </div>

              <div className="p-4 rounded-xl bg-gradient-to-br from-pink-50 to-sky-50 border border-pink-200 text-left text-sm text-slate-700 space-y-2">
                <p className="font-semibold text-pink-800">Já recebemos os dados da sua reserva.</p>
                <p>Em breve, o vendedor entrará em contato pelo seu WhatsApp para informar o prazo e combinar a entrega em sua residência.</p>
                {submittedOrder.payment_method === 'pix' ? (
                  <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                    <p className="font-semibold text-emerald-800">Pagamento via PIX</p>
                    <p className="mt-1 text-xs text-emerald-700">Copie o código abaixo para pagar R$ {submittedOrder.total_amount.toFixed(2).replace('.', ',')}.</p>
                    <textarea
                      readOnly
                      value={pixCopyPaste}
                      rows={4}
                      className="mt-2 w-full resize-none rounded-lg border border-emerald-200 bg-white p-2 text-[10px] text-slate-700"
                    />
                    <button
                      type="button"
                      onClick={handleCopyPix}
                      className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      {pixCopied ? 'Código copiado!' : 'Copiar código PIX'}
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800">
                    <p className="font-semibold">Pagamento no crédito/débito</p>
                    <p className="mt-1">Crédito ou débito por aproximação na entrega.</p>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={handleDownloadPdf}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-pink-200 bg-white px-4 py-3 text-sm font-semibold text-pink-700 transition-colors hover:bg-pink-50"
              >
                <Download className="h-4 w-4" />
                Baixar pedido em PDF
              </button>
            </div>
          ) : (
            /* Formulário de Pedido */
            <form id="checkout-order-form" onSubmit={handleSubmitOrder} className="space-y-3">
              {/* Lista de Itens no Carrinho */}
              <div className={mobileStep === 1 ? 'block' : 'hidden'}>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600 mb-2.5">
                  <span className="flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4 text-pink-600" />
                    Sacola ({activeCart.length} {activeCart.length === 1 ? 'adicionado' : 'adicionados'})
                  </span>
                </h3>

                {cart.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-pink-200 bg-pink-50/60 p-6 text-center">
                    <ShoppingCart className="mx-auto h-10 w-10 text-pink-400" />
                    <p className="mt-3 text-sm font-bold text-slate-800">Seu carrinho está vazio</p>
                    <p className="mt-1 text-xs text-slate-600">Escolha um sabor no cardápio para começar seu pedido.</p>
                    <p className="mt-3 rounded-xl bg-white/80 px-3 py-2 text-xs font-medium text-pink-700">{emptyCartTip}</p>
                  </div>
                ) : (
                <div className="space-y-1.5 max-h-[32dvh] overflow-y-auto overscroll-contain pr-1">
                  {cart.map(item => (
                    <div
                      key={item.cake.id}
                      className={`mobile-cart-item relative flex items-center justify-between p-2 rounded-xl border ${item.status === 'expired' ? 'bg-red-50 border-red-200' : 'bg-violet-50/60 border-violet-200/60'}`}
                    >
                      <div className="mobile-cart-info flex items-center space-x-2.5 overflow-hidden">
                        <img
                          src={item.cake.image_url || '/assets/cake-card.svg'}
                          alt={item.cake.name}
                          className="w-9 h-9 rounded-lg object-cover flex-shrink-0"
                          referrerPolicy="no-referrer"
                          loading="lazy"
                          decoding="async"
                        />
                        <div className="truncate">
                          <p className={`text-xs font-semibold truncate ${item.status === 'expired' ? 'text-red-700 line-through decoration-red-600 decoration-2' : 'text-slate-800'}`}>
                            {item.cake.name}
                          </p>
                          <p className="text-xs text-slate-600">
                            {item.quantity}x • R$ {item.cake.price.toFixed(2).replace('.', ',')}
                          </p>
                          {item.expires_at && (
                            <p className={`mt-0.5 text-[11px] tabular-nums font-semibold ${item.status === 'expired' ? 'text-red-700' : 'text-amber-800'}`}>
                              {item.status === 'expired' ? 'Expirou • não será comprado' : `Reservado por ${reservationClock(item.expires_at, reservationNow)}`}
                            </p>
                          )}
                          {item.status === 'expired' && onRenewItem && (
                            <button type="button" disabled={reservationBusy || isLoading} onClick={() => onRenewItem(item)} className="mt-1 text-[11px] font-semibold text-pink-700 underline disabled:opacity-40">Reservar novamente</button>
                          )}
                          <div className="mt-1 flex items-center gap-1 sm:hidden" aria-label={`Quantidade de ${item.cake.name}`}>
                            <button
                              type="button"
                              onClick={() => onUpdateQuantity(item.cake.id, item.quantity - 1)}
                              disabled={item.quantity <= 1 || item.status === 'expired' || reservationBusy || isLoading}
                              aria-label={`Diminuir quantidade de ${item.cake.name}`}
                              className="h-9 w-9 rounded-lg border border-violet-200 bg-white text-slate-700 disabled:opacity-40"
                            >
                              <Minus className="mx-auto h-4 w-4" />
                            </button>
                            <span className="min-w-8 text-center text-sm font-bold">{item.quantity}</span>
                            <button
                              type="button"
                              onClick={() => onUpdateQuantity(item.cake.id, item.quantity + 1)}
                              disabled={item.quantity >= item.cake.stock_quantity || item.status === 'expired' || reservationBusy || isLoading}
                              aria-label={`Aumentar quantidade de ${item.cake.name}`}
                              className="h-9 w-9 rounded-lg border border-violet-200 bg-white text-slate-700 disabled:opacity-40"
                            >
                              <Plus className="mx-auto h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="mobile-cart-actions flex items-center space-x-3 flex-shrink-0">
                        <span className={`text-xs font-bold ${item.status === 'expired' ? 'text-red-700 line-through decoration-red-600' : 'text-pink-700'}`}>
                          R$ {(item.cake.price * item.quantity).toFixed(2).replace('.', ',')}
                        </span>
                        <button
                          type="button"
                          onClick={() => onRemoveItem(item.cake.id)}
                          disabled={reservationBusy || isLoading}
                          aria-label={`Remover ${item.cake.name} do carrinho`}
                          className="min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 p-1 text-slate-500 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                )}

                {retryUncertain && (
                  <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                    {errorMessage && <p role="alert" className="mb-1">{errorMessage}</p>}
                    <p>A resposta do pedido não foi confirmada. Verifique antes de iniciar outra compra.</p>
                    <button type="submit" formNoValidate disabled={isLoading || reservationBusy} className="mt-1 min-h-9 font-semibold underline">{isLoading ? 'Verificando...' : 'Verificar confirmação do pedido'}</button>
                  </div>
                )}
                {cart.some(item => item.status === 'expired') && <p className="mt-2 text-xs text-red-700">Itens riscados foram liberados para a loja e não entram no total. Você pode concluir com os demais.</p>}
                <p className="mt-2 text-[11px] text-slate-500">Cada produto fica reservado por 10 minutos. Alterar a quantidade não reinicia o prazo.</p>
                <div className="flex justify-between items-center pt-3 mt-2 border-t border-violet-100 text-sm">
                  <span className="text-slate-600">Total do Pedido:</span>
                  <span className="text-lg font-serif font-bold text-pink-700">
                    R$ {totalAmount.toFixed(2).replace('.', ',')}
                  </span>
                </div>
                {activeCart.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setMobileStep(2)}
                    className="mt-3 min-h-10 w-full rounded-xl bg-pink-600 px-4 py-2.5 text-sm font-semibold text-white"
                  >
                    Continuar para entrega
                  </button>
                )}
              </div>

              {activeCart.length > 0 && (
                <div className={`mobile-checkout-details ${mobileStep === 2 ? 'space-y-3' : 'hidden'}`}>
                  <button
                    type="button"
                    onClick={() => setMobileStep(1)}
                    className="flex min-h-9 items-center gap-2 text-xs font-semibold text-pink-700"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Voltar para a sacola
                  </button>
                  {cart.some(item => item.status === 'expired') && <p className="rounded-lg bg-red-50 p-2 text-xs text-red-700">Uma reserva expirou. O total inclui apenas os itens ainda reservados.</p>}
                  <p className="text-right text-sm font-semibold text-pink-700 mb-3 pointer-events-none">Total: R$ {totalAmount.toFixed(2).replace('.', ',')}</p>
                  <div className="rounded-xl border border-pink-100 bg-pink-50/50 p-2.5">
                    <label className="block text-xs text-slate-700 mb-1 flex items-center space-x-1.5">
                      <CreditCard className="w-3 h-3 text-pink-600" />
                      <span>Forma de pagamento *</span>
                    </label>
                    <select
                      required
                      value={paymentMethod}
                      onChange={e => {
                        if (e.target.value === 'pix' || e.target.value === 'credito') {
                          setPaymentMethod(e.target.value);
                        }
                      }}
                      className="w-full min-h-10 px-3 py-2 rounded-lg bg-white border border-violet-200 text-slate-900 text-base sm:text-xs focus:outline-none focus:border-pink-400"
                    >
                      <option value="credito">Crédito/débito</option>
                      <option value="pix">PIX — pagar antes da entrega</option>
                    </select>
                    <p className="mt-1 text-sm sm:text-[11px] text-slate-500">
                      {paymentMethod === 'pix'
                        ? 'Após enviar, você receberá o código PIX para copiar e pagar.'
                        : 'Por aproximação, no ato da entrega.'}
                    </p>
                  </div>

                  {/* Erro se houver */}
                  {errorMessage && (
                     <div role="alert" className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm sm:text-xs">
                      {errorMessage}
                    </div>
                  )}

                  {/* Dados do Cliente (Em conformidade com a LGPD: estritamente mínimos) */}
                  <div className="space-y-2.5 pt-2 border-t border-violet-100">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Dados para Confirmação e Entrega
                </h3>

<div className="grid gap-2.5 sm:grid-cols-2">
                <div>
                  <label className="block text-xs text-slate-700 mb-1 flex items-center space-x-1.5">
                    <User className="w-3 h-3 text-pink-600" />
                    <span>Seu Nome *</span>
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={80}
                    value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                    placeholder="Ex: Maria Oliveira"
                    className="w-full min-h-10 px-3 py-2 rounded-lg bg-violet-50 border border-violet-200 text-slate-900 text-base sm:text-xs focus:outline-none focus:border-pink-400"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-700 mb-1 flex items-center space-x-1.5">
                    <Phone className="w-3 h-3 text-pink-600" />
                    <span>WhatsApp / Telefone para Contato *</span>
                  </label>
                  <input
                    type="tel"
                    required
                    maxLength={25}
                    value={customerPhone}
                    onChange={e => setCustomerPhone(e.target.value)}
                    placeholder="(27) 99999-9999"
                    className="w-full min-h-10 px-3 py-2 rounded-lg bg-violet-50 border border-violet-200 text-slate-900 text-base sm:text-xs focus:outline-none focus:border-pink-400"
                  />
                </div>

                </div>
                <div>
                  <label className="block text-xs text-slate-700 mb-1 flex items-center space-x-1.5">
                    <MapPin className="w-3 h-3 text-pink-600" />
                    <span>Local de Entrega no Condomínio *</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      required
                      value={deliveryBlock}
                      onChange={e => setDeliveryBlock(e.target.value)}
                      aria-label="Bloco"
                      className="w-full min-h-10 px-3 py-2 rounded-lg bg-violet-50 border border-violet-200 text-slate-900 text-base sm:text-xs focus:outline-none focus:border-pink-400"
                    >
                      <option value="">Bloco</option>
                      {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map(block => (
                        <option key={block} value={block}>
                          Bloco {block}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      required
                      maxLength={30}
                      value={deliveryApartment}
                      onChange={e => setDeliveryApartment(e.target.value)}
                      placeholder="APT"
                      aria-label="Apartamento"
                      className="w-full min-h-10 px-3 py-2 rounded-lg bg-violet-50 border border-violet-200 text-slate-900 text-base sm:text-xs focus:outline-none focus:border-pink-400"
                    />
                  </div>
                </div>

                <details className="rounded-lg border border-violet-100 bg-violet-50/40 p-2.5">
                  <summary className="cursor-pointer text-xs font-medium text-slate-700">Observações (opcional)</summary>
                  <label className="sr-only" htmlFor="checkout-notes">Observações do pedido</label>
                  <textarea id="checkout-notes" rows={2} maxLength={250} value={notes}
                    onChange={e => setNotes(e.target.value)} placeholder="Recado ou orientação para entrega"
                    className="mt-2 w-full resize-none rounded-lg border border-violet-200 bg-white p-2 text-base sm:text-xs" />
                </details>
                  </div>


                </div>
              )}
            </form>
          )}
        </div>
        {!submittedOrder && cart.length > 0 && mobileStep === 2 && (
          <div className="shrink-0 border-t border-violet-100 bg-white px-3 pt-2 pb-[max(.625rem,env(safe-area-inset-bottom))] sm:px-4">
            <button type="submit" form="checkout-order-form" id="btn-confirm-order-submit" disabled={isLoading || reservationBusy || activeCart.length === 0}
              className="flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-pink-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-pink-500 disabled:opacity-50">
              <Send className="h-4 w-4" />
              {isLoading ? 'Confirmando reserva...' : 'Confirmar reserva'}
            </button>
            <p className="mt-1.5 text-center text-[10px] text-slate-500">Seus dados são usados apenas para confirmar e entregar este pedido.</p>
          </div>
        )}
      </motion.div>
    </div>
  );
};
