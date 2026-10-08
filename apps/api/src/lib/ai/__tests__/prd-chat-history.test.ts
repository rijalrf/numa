import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChatHistory } from '../prd.js';

const idea = 'Aplikasi kasir warung.';

test('riwayat chat dibuang bila hanya berisi ide awal (agar tidak terkirim dua kali)', () => {
  assert.equal(buildChatHistory([{ role: 'user', content: idea }], idea), undefined);
  assert.equal(buildChatHistory([{ role: 'user', content: `  ${idea}  ` }], idea), undefined);
  assert.equal(buildChatHistory([], idea), undefined);
});

test('riwayat chat dipertahankan penuh bila ada percakapan di luar ide awal', () => {
  const out = buildChatHistory(
    [
      { role: 'user', content: idea },
      { role: 'assistant', content: 'Apakah ada stok barang?' },
      { role: 'user', content: 'Ya, ada.' },
    ],
    idea,
  );
  assert.equal(out, `user: ${idea}\nassistant: Apakah ada stok barang?\nuser: Ya, ada.`);
});
