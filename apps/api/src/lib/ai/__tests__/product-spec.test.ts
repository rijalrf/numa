import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ProductSpecSchema, checkSpecConsistency } from '../product-spec';
import { readPrdContent } from '../prd';

const rawSpec = {
  entities: [
    { name: 'User', fields: [{ name: 'id', type: 'string', required: true }], relations: ['Order (1:N)'] },
    { name: 'Order', fields: [{ name: 'id', type: 'string' }], relations: ['Ghost (N:1)'] },
  ],
  endpoints: [
    { method: 'post', path: '/api/orders', description: 'Buat pesanan', requirementIds: ['FR-001'] },
    { method: 'POST', path: '/api/orders' },
  ],
  rules: [{ id: 'PR-001', description: 'Total tidak boleh negatif' }],
  journeys: [{ name: 'Pesan', steps: ['Login', 'Pesan'] }],
};

test('ProductSpecSchema menormalkan method dan mengisi default', () => {
  const spec = ProductSpecSchema.parse(rawSpec);
  assert.equal(spec.endpoints[0].method, 'POST');
  assert.deepEqual(spec.personas, []);
});

test('checkSpecConsistency menandai relasi yatim dan endpoint ganda', () => {
  const warnings = checkSpecConsistency(ProductSpecSchema.parse(rawSpec));
  assert.ok(warnings.some((w) => w.includes('Ghost')));
  assert.ok(warnings.some((w) => w.includes('POST /api/orders')));
});

test('readPrdContent menurunkan dataModels dan apiEndpoints dari spec', () => {
  const doc = readPrdContent({ markdown: '- **FR-001**: Buat pesanan', spec: rawSpec });
  assert.equal(doc.dataModels?.length, 2);
  assert.equal(doc.apiEndpoints?.[0].path, '/api/orders');
  assert.equal(doc.productRules?.[0].id, 'PR-001');
});

test('readPrdContent tetap membaca PRD markdown tanpa spec', () => {
  const doc = readPrdContent({ markdown: '- **FR-001**: Buat pesanan' });
  assert.equal(doc.spec, undefined);
  assert.equal(doc.requirementIndex[0].id, 'FR-001');
});

test('readPrdContent mengabaikan spec yang tidak valid', () => {
  const doc = readPrdContent({ markdown: 'x', spec: { endpoints: 'bukan array' } });
  assert.equal(doc.spec, undefined);
});

test('parseRequirementIndex membaca ID bertebal dan polos beserta judulnya', () => {
  const doc = readPrdContent('- **FR-001**: Login pengguna\n- PR-002 - Password di-hash\n- **BR-003**: Diskon maksimal 50%');
  assert.deepEqual(
    doc.requirementIndex.map((r) => [r.id, r.title]),
    [
      ['FR-001', 'Login pengguna'],
      ['PR-002', 'Password di-hash'],
      ['BR-003', 'Diskon maksimal 50%'],
    ],
  );
});
