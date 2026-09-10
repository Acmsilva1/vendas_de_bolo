import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CartItem, Order } from '../types';
import { X, Send, ShoppingCart, Trash2, CheckCircle, MapPin, Phone, User, FileText, Download, CreditCard, Copy, Minus, Plus, ArrowLeft } from 'lucide-react';

interface OrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  cart: CartItem[];
  onRemoveItem: (cakeId: number) => void;
  onUpdateQuantity: (cakeId: number, qty: number) => void;
  onOrderSuccess: (order: Order) => void;
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
  onOrderSuccess
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
  const [submittedOrder, setSubmittedOrder] = useState<Order | null>(null);
  const [mobileStep, setMobileStep] = useState<1 | 2>(1);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const handleResetAndClose = useCallback(() => {
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

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = 'hidden';
    window.requestAnimationFrame(() => closeButtonRef.current?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        handleResetAndClose();
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
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [handleResetAndClose, isOpen]);

  if (!isOpen) return null;

  const totalAmount = cart.reduce((sum, item) => sum + item.cake.price * item.quantity, 0);
  const emptyCartTips = [
    'Que tal experimentar o Bolo de Fubá? É simples, caseiro e combina com qualquer café.',
    'O Bolo de Laranja é uma escolha leve e perfumada para adoçar o dia.',
    'Se quiser algo mais especial, experimente um dos bolos com cobertura.',
    'Comece pelo seu sabor favorito e monte seu pedido do jeitinho que quiser.'
  ];
  const emptyCartTip = emptyCartTips[Math.floor(Date.now() / 60000) % emptyCartTips.length];

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!customerName.trim() || !customerPhone.trim()) {
      setErrorMessage('Por favor, informe seu nome e telefone para contato.');
      return;
    }

    const phoneDigits = customerPhone.replace(/\D/g, '');
    if (!/^27\d{8,9}$/.test(phoneDigits)) {
      setErrorMessage('Informe um WhatsApp válido do Espírito Santo com DDD 27.');
      return;
    }

    if (!deliveryBlock.trim() || !deliveryApartment.trim()) {
      setErrorMessage('Por favor, informe o bloco e o apartamento.');
      return;
    }

    if (cart.length === 0) {
      setErrorMessage('Sua sacola está vazia.');
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
        items: cart.map(item => ({
          cake_id: item.cake.id,
          quantity: item.quantity
        }))
      };

      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (!res.ok || !data.order) {
        throw new Error(data.error || 'Falha ao registrar pedido.');
      }

      setSubmittedOrder(data.order);
      onOrderSuccess(data.order);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao processar pedido.';
      setErrorMessage(msg);
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

    const normalizePdfText = (value: string) =>
      value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E]/g, '');
    const escapePdfText = (value: string) => normalizePdfText(value).replace(/([\\()])/g, '\\$1');
    const itemLines = submittedOrder.items.map(item =>
      `• ${item.quantity}x ${item.cake_name}  |  R$ ${item.subtotal.toFixed(2).replace('.', ',')}`
    );
    const content = [
      'q',
      '0.99 0.94 0.97 rg',
      '0 0 612 792 re f',
      'Q',
      '0.74 0.09 0.36 rg',
      '50 690 512 1 re f',
      'BT',
      '/F1 24 Tf',
      '50 735 Td',
      `(${escapePdfText('Sua reserva de bolos')}) Tj`,
      '/F1 12 Tf',
      '0 -28 Td',
      '0.28 0.33 0.41 rg',
      `(${escapePdfText('Obrigada por escolher a Delicias da Ju!')}) Tj`,
      '/F1 13 Tf',
      '0 -70 Td',
      '0.74 0.09 0.36 rg',
      `(${escapePdfText('O que voce escolheu')}) Tj`,
      '/F1 11 Tf',
      '0 -30 Td',
      '0.20 0.25 0.32 rg',
      ...itemLines.map(line => `0 -24 Td (${escapePdfText(line)}) Tj`),
      '0 -48 Td',
      '0.74 0.09 0.36 rg',
      '/F1 16 Tf',
      `(${escapePdfText(`Total da reserva: R$ ${submittedOrder.total_amount.toFixed(2).replace('.', ',')}`)}) Tj`,
      '/F1 11 Tf',
      '0 -42 Td',
      '0.28 0.33 0.41 rg',
      `(${escapePdfText(`Forma de pagamento: ${submittedOrder.payment_method === 'pix' ? 'PIX' : 'Credito - aproximacao na entrega'}`)}) Tj`,
      '0 -28 Td',
      `(${escapePdfText('Em breve, falaremos com voce pelo WhatsApp para combinar a entrega.')}) Tj`,
      '0 -24 Td',
      `(${escapePdfText('Guarde este arquivo como lembrete da sua reserva.')}) Tj`,
      'ET'
    ].join('\n');
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`
    ];
    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    objects.forEach((object, index) => {
      offsets.push(pdf.length);
      pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xrefOffset = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    offsets.slice(1).forEach(offset => {
      pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
    });
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

    const url = URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'pedido-delicias-da-ju.pdf';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-violet-950/35 sm:backdrop-blur-sm sm:overflow-y-auto">
      <motion.div
        ref={dialogRef}
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-modal-title"
        className="flex h-[100dvh] w-full flex-col bg-white text-slate-900 overflow-hidden sm:block sm:h-auto sm:max-w-lg sm:border sm:border-violet-100 sm:rounded-2xl sm:shadow-2xl sm:my-6"
      >
        {/* Cabeçalho do Modal */}
        <div className="flex items-center justify-between p-3 sm:p-5 border-b border-violet-100 bg-rose-50/60">
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
          <div className="flex items-center gap-2 border-b border-violet-100 px-4 py-2 text-sm sm:hidden" aria-label={`Etapa ${mobileStep} de 2`}>
            <span className={`h-2 flex-1 rounded-full ${mobileStep >= 1 ? 'bg-pink-600' : 'bg-violet-100'}`} />
            <span className={`h-2 flex-1 rounded-full ${mobileStep >= 2 ? 'bg-pink-600' : 'bg-violet-100'}`} />
            <span className="ml-1 font-semibold text-slate-700">{mobileStep}/2</span>
          </div>
        )}

        {/* Corpo do Modal */}
        <div className="flex-1 overflow-y-auto p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:block sm:overflow-visible sm:p-5">
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
                    <p className="font-semibold">Pagamento no crédito</p>
                    <p className="mt-1">O pagamento será feito por aproximação no ato da entrega.</p>
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
            <form onSubmit={handleSubmitOrder} className="space-y-5">
              {/* Lista de Itens no Carrinho */}
              <div className={mobileStep === 1 ? 'block' : 'hidden sm:block'}>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600 mb-2.5">
                  <span className="flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4 text-pink-600" />
                    Carrinho ({cart.length})
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
                <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                  {cart.map(item => (
                    <div
                      key={item.cake.id}
                      className="mobile-cart-item relative flex items-center justify-between p-2.5 rounded-xl bg-violet-50/60 border border-violet-200/60"
                    >
                      <div className="mobile-cart-info flex items-center space-x-2.5 overflow-hidden">
                        <img
                          src={item.cake.image_url || '/assets/cake-card.svg'}
                          alt={item.cake.name}
                          className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                          referrerPolicy="no-referrer"
                          loading="lazy"
                          decoding="async"
                        />
                        <div className="truncate">
                          <p className="text-xs font-semibold text-slate-800 truncate">
                            {item.cake.name}
                          </p>
                          <p className="text-sm sm:text-[11px] text-slate-600">
                            {item.quantity}x • R$ {item.cake.price.toFixed(2).replace('.', ',')}
                          </p>
                          <div className="mt-1 flex items-center gap-1 sm:hidden" aria-label={`Quantidade de ${item.cake.name}`}>
                            <button
                              type="button"
                              onClick={() => onUpdateQuantity(item.cake.id, item.quantity - 1)}
                              disabled={item.quantity <= 1}
                              aria-label={`Diminuir quantidade de ${item.cake.name}`}
                              className="min-h-11 min-w-11 rounded-lg border border-violet-200 bg-white text-slate-700 disabled:opacity-40"
                            >
                              <Minus className="mx-auto h-4 w-4" />
                            </button>
                            <span className="min-w-8 text-center text-sm font-bold">{item.quantity}</span>
                            <button
                              type="button"
                              onClick={() => onUpdateQuantity(item.cake.id, item.quantity + 1)}
                              disabled={item.quantity >= item.cake.stock_quantity}
                              aria-label={`Aumentar quantidade de ${item.cake.name}`}
                              className="min-h-11 min-w-11 rounded-lg border border-violet-200 bg-white text-slate-700 disabled:opacity-40"
                            >
                              <Plus className="mx-auto h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="mobile-cart-actions flex items-center space-x-3 flex-shrink-0">
                        <span className="text-xs font-bold text-pink-700">
                          R$ {(item.cake.price * item.quantity).toFixed(2).replace('.', ',')}
                        </span>
                        <button
                          type="button"
                          onClick={() => onRemoveItem(item.cake.id)}
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

                <div className="flex justify-between items-center pt-3 mt-2 border-t border-violet-100 text-sm">
                  <span className="text-slate-600">Total do Pedido:</span>
                  <span className="text-lg font-serif font-bold text-pink-700">
                    R$ {totalAmount.toFixed(2).replace('.', ',')}
                  </span>
                </div>
                {cart.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setMobileStep(2)}
                    className="mt-4 min-h-11 w-full rounded-xl bg-pink-600 px-4 py-3 text-base font-semibold text-white sm:hidden"
                  >
                    Continuar para entrega
                  </button>
                )}
              </div>

              {cart.length > 0 && (
                <div className={`mobile-checkout-details ${mobileStep === 2 ? 'space-y-4' : 'hidden'} sm:contents`}>
                  <button
                    type="button"
                    onClick={() => setMobileStep(1)}
                    className="flex min-h-11 items-center gap-2 text-sm font-semibold text-pink-700 sm:hidden"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Voltar para a sacola
                  </button>
                  <div className="rounded-xl border border-pink-100 bg-pink-50/50 p-3">
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
                      className="w-full min-h-11 sm:min-h-0 px-3 py-2 rounded-xl bg-white border border-violet-200 text-slate-900 text-base sm:text-xs focus:outline-none focus:border-pink-400"
                    >
                      <option value="credito">CRÉDITO — aproximação na entrega</option>
                      <option value="pix">PIX — pagar antes da entrega</option>
                    </select>
                    <p className="mt-1 text-sm sm:text-[11px] text-slate-500">
                      {paymentMethod === 'pix'
                        ? 'Após enviar, você receberá o código PIX para copiar e pagar.'
                        : 'O pagamento será feito por aproximação no ato da entrega.'}
                    </p>
                  </div>

                  {/* Erro se houver */}
                  {errorMessage && (
                     <div role="alert" className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm sm:text-xs">
                      {errorMessage}
                    </div>
                  )}

                  {/* Dados do Cliente (Em conformidade com a LGPD: estritamente mínimos) */}
                  <div className="space-y-3 pt-2 border-t border-violet-100">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Dados para Confirmação e Entrega
                </h3>

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
                    className="w-full min-h-11 sm:min-h-0 px-3 py-2 rounded-xl bg-violet-50 border border-violet-200 text-slate-900 text-base sm:text-xs focus:outline-none focus:border-pink-400"
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
                    className="w-full min-h-11 sm:min-h-0 px-3 py-2 rounded-xl bg-violet-50 border border-violet-200 text-slate-900 text-base sm:text-xs focus:outline-none focus:border-pink-400"
                  />
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
                      className="w-full min-h-11 sm:min-h-0 px-3 py-2 rounded-xl bg-violet-50 border border-violet-200 text-slate-900 text-base sm:text-xs focus:outline-none focus:border-pink-400"
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
                      className="w-full min-h-11 sm:min-h-0 px-3 py-2 rounded-xl bg-violet-50 border border-violet-200 text-slate-900 text-base sm:text-xs focus:outline-none focus:border-pink-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-slate-700 mb-1 flex items-center space-x-1.5">
                    <FileText className="w-3 h-3 text-pink-600" />
                    <span>Observações (opcional)</span>
                  </label>
                  <textarea
                    rows={2}
                    maxLength={250}
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Ex: Embalagem para presente, recado especial, etc."
                    className="w-full px-3 py-2 rounded-xl bg-violet-50 border border-violet-200 text-slate-900 text-base sm:text-xs focus:outline-none focus:border-pink-400 resize-none"
                  />
                </div>
                  </div>

                  {/* Botão de Envio */}
                  <p className="text-xs text-slate-600 text-center sm:hidden">
                    🔒 Seus dados serão utilizados exclusivamente para a confirmação deste pedido.
                  </p>
                  <div className="fixed bottom-0 left-0 right-0 z-10 border-t border-violet-100 bg-white px-4 pb-[calc(.75rem+env(safe-area-inset-bottom))] pt-3 sm:static sm:border-t sm:border-violet-100 sm:p-0 sm:pt-3">
                <button
                  type="submit"
                  id="btn-confirm-order-submit"
                  disabled={isLoading || cart.length === 0}
                  className="w-full py-3 px-4 rounded-xl bg-pink-600 hover:bg-pink-500 active:scale-98 disabled:opacity-50 text-white font-semibold text-sm transition-all flex items-center justify-center space-x-2 shadow-lg cursor-pointer"
                >
                  <Send className="w-4 h-4 text-sky-200" />
                  <span>{isLoading ? 'Confirmando reserva...' : 'Confirmar reserva'}</span>
                </button>
                <p className="hidden text-[11px] text-slate-600 text-center mt-2 sm:block">
                  🔒 Seus dados serão utilizados exclusivamente para a confirmação deste pedido.
                </p>
                  </div>
                </div>
              )}
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
};
