import test from 'node:test';
import assert from 'node:assert/strict';
import { buildZip } from '../zip.js';

test('buildZip menghasilkan arsip dengan magic number header yang valid', () => {
  const zip = buildZip([
    { name: 'hello.txt', content: 'Halo Dunia' },
    { name: 'sub/doc.md', content: '# Judul' },
  ]);
  assert.ok(zip.length > 50);
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
});
