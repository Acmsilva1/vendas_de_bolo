import type { Order } from './types';

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 42;
const BOTTOM = 770;
const PINK = '0.75 0.04 0.34';
const INK = '0.16 0.20 0.27';
const MUTED = '0.37 0.41 0.48';
const WIDTHS = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];

function printable(value: string): string {
  return value.normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[\u2010-\u2015]/g, '-').replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"').replace(/\u00a0/g, ' ')
    .replace(/[^\u0020-\u007e\u00a1-\u00ff]/gu, '?');
}

function hex(value: string): string {
  return Array.from(printable(value), char => char.charCodeAt(0).toString(16).padStart(2, '0')).join('');
}

function width(value: string, size: number, bold = false): number {
  return Array.from(printable(value)).reduce((sum, char) => {
    const base = char.normalize('NFD')[0];
    const code = base.charCodeAt(0);
    return sum + (WIDTHS[code - 32] ?? 600);
  }, 0) * size / 1000 * (bold ? 1.08 : 1);
}

export function wrapPdfText(value: string, maxWidth: number, size = 10): string[] {
  const words = printable(value).trim().split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (line && width(`${line} ${word}`, size) <= maxWidth) {
      line += ` ${word}`;
      continue;
    }
    if (line) lines.push(line);
    line = '';
    for (const char of word) {
      if (line && width(line + char, size) > maxWidth) {
        lines.push(line);
        line = '';
      }
      line += char;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

const money = (value: number) => new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL'
}).format(value);

export function createOrderPdf(order: Order): Uint8Array {
  const pages: string[][] = [];
  let commands: string[] = [];
  let y = 0;
  const text = (value: string, x: number, top: number, size = 10, bold = false, color = INK) => {
    commands.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${color} rg 1 0 0 1 ${x.toFixed(2)} ${(PAGE_HEIGHT - top).toFixed(2)} Tm <${hex(value)}> Tj ET`);
  };
  const right = (value: string, x: number, top: number, size = 10, bold = false, color = INK) =>
    text(value, x - width(value, size, bold), top, size, bold, color);
  const rect = (x: number, top: number, w: number, h: number, color: string) =>
    commands.push(`${color} rg ${x} ${PAGE_HEIGHT - top - h} ${w} ${h} re f`);
  const rule = (top: number) => rect(MARGIN, top, PAGE_WIDTH - MARGIN * 2, 0.6, '0.88 0.89 0.91');
  const newPage = () => {
    commands = [];
    pages.push(commands);
    rect(0, 0, PAGE_WIDTH, 7, PINK);
    text('Delícias da Jú', MARGIN, 48, 23, true, PINK);
    text('Feito com carinho para adoçar seu dia.', MARGIN, 67, 10, false, MUTED);
    text('SUA RESERVA', MARGIN, 102, 10, true, PINK);
    right(`Pedido ${order.order_code}`, PAGE_WIDTH - MARGIN, 102, 11, true);
    rule(115);
    y = 136;
  };
  const ensure = (height: number) => {
    if (y + height > BOTTOM) newPage();
  };
  const paragraph = (value: string, maxWidth = PAGE_WIDTH - MARGIN * 2, size = 10, color = INK) => {
    for (const line of wrapPdfText(value, maxWidth, size)) {
      ensure(15);
      text(line, MARGIN, y, size, false, color);
      y += 15;
    }
  };
  newPage();
  const created = new Date(order.created_at);
  const date = Number.isNaN(created.getTime()) ? 'Data não informada' : new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).format(created);
  paragraph(`Reservado em ${date} (horário de Brasília)`, undefined, 9, MUTED);
  y += 14;
  text('CLIENTE E ENTREGA', MARGIN, y, 9, true, PINK);
  y += 21;
  paragraph(order.customer_name);
  paragraph(`Bloco ${order.delivery_block} - Apartamento ${order.delivery_apartment}`);
  y += 18;

  const tableHeader = () => {
    rect(MARGIN, y - 13, PAGE_WIDTH - MARGIN * 2, 29, '0.98 0.94 0.96');
    text('ITEM', MARGIN + 10, y + 5, 9, true, PINK);
    right('QTD.', 354, y + 5, 9, true, PINK);
    right('UNITÁRIO', 443, y + 5, 9, true, PINK);
    right('SUBTOTAL', PAGE_WIDTH - MARGIN - 10, y + 5, 9, true, PINK);
    y += 35;
  };
  ensure(65);
  tableHeader();
  for (const item of order.items) {
    const lines = wrapPdfText(item.cake_name, 240);
    const rowHeight = lines.length * 15 + 19;
    if (rowHeight <= BOTTOM - 171 && y + rowHeight > BOTTOM) {
      newPage();
      tableHeader();
    }
    let offset = 0;
    let first = true;
    while (offset < lines.length) {
      if (y + 34 > BOTTOM) {
        newPage();
        tableHeader();
      }
      const count = Math.min(lines.length - offset, Math.max(1, Math.floor((BOTTOM - y - 19) / 15)));
      lines.slice(offset, offset + count).forEach((line, index) => text(line, MARGIN + 10, y + index * 15));
      if (first) {
        right(String(item.quantity), 354, y);
        right(money(item.unit_price), 443, y);
        right(money(item.subtotal), PAGE_WIDTH - MARGIN - 10, y);
      }
      y += count * 15 + 5;
      rule(y);
      y += 14;
      offset += count;
      first = false;
    }
  }
  y += 10;
  ensure(65);
  rect(MARGIN, y - 9, PAGE_WIDTH - MARGIN * 2, 50, PINK);
  text('TOTAL DA RESERVA', MARGIN + 14, y + 20, 11, true, '1 1 1');
  right(money(order.total_amount), PAGE_WIDTH - MARGIN - 14, y + 23, 21, true, '1 1 1');
  y += 68;
  ensure(65);
  text('PAGAMENTO', MARGIN, y, 9, true, PINK);
  y += 20;
  paragraph(order.payment_method === 'pix' ? 'PIX - pagamento antes da entrega.' : 'Crédito/débito - por aproximação no ato da entrega.');
  paragraph('Este resumo da reserva não comprova o pagamento.', undefined, 9, MUTED);
  if (order.notes?.trim()) {
    y += 17;
    ensure(45);
    text('OBSERVAÇÕES', MARGIN, y, 9, true, PINK);
    y += 20;
    for (const part of order.notes.split(/\r?\n/)) paragraph(part);
  }
  y += 20;
  ensure(50);
  paragraph('Obrigada por escolher a Delícias da Jú!', undefined, 11, PINK);
  paragraph('Combinaremos os detalhes da entrega pelo WhatsApp.', undefined, 9, MUTED);

  pages.forEach((page, index) => {
    commands = page;
    rule(792);
    text('Guarde este resumo para acompanhar sua reserva.', MARGIN, 811, 8, false, MUTED);
    right(`${index + 1} / ${pages.length}`, PAGE_WIDTH - MARGIN, 811, 8, false, MUTED);
  });
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${5 + index * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'
  ];
  pages.forEach((page, index) => {
    const stream = page.join('\n');
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + index * 2} 0 R >>`);
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}
