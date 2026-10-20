import assert from 'node:assert/strict';
import test from 'node:test';
import { createOrderPdf, wrapPdfText } from '../web/orderPdf';
import type { Order } from '../web/types';

const order: Order = {
  id: 42, order_code: 'RES-EXEMPLO', customer_name: 'Cliente Fictício', customer_phone: '27900000000',
  delivery_block: 'A', delivery_apartment: '101', notes: 'Sem açúcar adicional.\nEntregar na portaria.',
  payment_method: 'credito', total_amount: 42, status: 'pendente', telegram_sent: false,
  created_at: '2026-10-20T01:30:00.000Z', updated_at: '2026-10-20T01:30:00.000Z',
  items: [{ cake_id: 1, cake_name: 'Bolo de maçã com canela', quantity: 2, unit_price: 21, subtotal: 42 }]
};

function pdfText(pdf: string): string {
  return Array.from(pdf.matchAll(/<([0-9a-f]+)> Tj/g), match => Buffer.from(match[1], 'hex').toString('latin1')).join('\n');
}

test('PDF preserva acentos, dados do pedido, valores e horário de São Paulo', () => {
  const pdf = new TextDecoder().decode(createOrderPdf(order));
  const text = pdfText(pdf);
  for (const expected of ['Delícias da Jú', 'Bolo de maçã', 'Cliente Fictício', 'Apartamento 101', '19/10/2026, 22:30', 'R$ 42,00', 'Crédito', 'Sem açúcar', '1 / 1']) {
    assert.ok(text.includes(expected), expected);
  }
  assert.ok(!text.includes(order.customer_phone), 'não exporta telefone pessoal desnecessário');
  assert.ok(pdf.includes('/WinAnsiEncoding'));
});

test('PDF mantém offsets e comprimentos de streams válidos e neutraliza conteúdo PDF em campos', () => {
  const pdf = new TextDecoder().decode(createOrderPdf({ ...order, customer_name: ') Tj ET /JavaScript (ação)' }));
  const xrefOffset = Number(pdf.match(/startxref\n(\d+)/)?.[1]);
  assert.equal(pdf.slice(xrefOffset, xrefOffset + 4), 'xref');
  for (const match of pdf.matchAll(/<< \/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/g)) {
    assert.equal(match[2].length, Number(match[1]));
  }
  assert.ok(!pdf.includes('/JavaScript'));
  assert.ok(pdfText(pdf).includes(') Tj ET /JavaScript (ação)'));
  const xref = pdf.slice(xrefOffset).split('\n').slice(3);
  xref.forEach((line, index) => {
    if (/^\d{10} 00000 n /.test(line)) assert.ok(pdf.slice(Number(line.slice(0, 10))).startsWith(`${index + 1} 0 obj`));
  });
});

test('PDF pagina muitos itens e palavras longas sem perder conteúdo ou total', () => {
  const items = Array.from({ length: 70 }, (_, index) => ({ ...order.items[0], cake_id: index + 1, cake_name: `Item ${index + 1} - Sobremesa de chocolate e café com castanhas caramelizadas` }));
  const pdf = new TextDecoder().decode(createOrderPdf({ ...order, items, total_amount: 2940 }));
  const text = pdfText(pdf);
  const count = Number(pdf.match(/\/Count (\d+)/)?.[1]);
  assert.ok(count >= 3);
  for (let index = 1; index <= 70; index++) assert.ok(text.includes(`Item ${index} -`));
  assert.ok(text.includes('R$ 2.940,00'));
  assert.ok(text.includes(`${count} / ${count}`));
  assert.ok((text.match(/UNITÁRIO/g) || []).length >= count - 1, 'repete cabeçalho em páginas de itens; resumo pode ocupar página própria');
  const longWord = 'á'.repeat(1200);
  const lines = wrapPdfText(longWord, 240);
  assert.ok(lines.length > 10);
  assert.equal(lines.join(''), longWord);
  const huge = pdfText(new TextDecoder().decode(createOrderPdf({ ...order, items: [{ ...order.items[0], cake_name: longWord.repeat(4) }] })));
  assert.equal(huge.split('\n').filter(line => /^á+$/.test(line)).join('').length, 4800);
});
