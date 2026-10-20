import assert from 'node:assert/strict';
import test from 'node:test';
import { whatsappGreeting } from '../api/_greeting.js';

test('saudação e ícone usam São Paulo independente do fuso do servidor', () => {
  for (const [iso, prefix] of [
    ['2026-10-20T02:59:59Z', 'Boa noite! 🌙✨'],
    ['2026-10-20T03:00:00Z', 'Bom dia! ☀️'],
    ['2026-10-20T14:59:59Z', 'Bom dia! ☀️'],
    ['2026-10-20T15:00:00Z', 'Boa tarde! 🌤️'],
    ['2026-10-20T20:59:59Z', 'Boa tarde! 🌤️'],
    ['2026-10-20T21:00:00Z', 'Boa noite! 🌙✨']
  ]) assert.ok(whatsappGreeting(new Date(iso)).startsWith(prefix), iso);
});
