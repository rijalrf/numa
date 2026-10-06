import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BusinessFlowSchema } from '../schemas';

type Flow = Record<string, any>;

function validFlow(): Flow {
  return {
    processName: 'Alur Pemesanan',
    lanes: [
      { id: 'lane-c', name: 'Pelanggan', kind: 'human' },
      { id: 'lane-a', name: 'Admin', kind: 'human' },
      { id: 'lane-s', name: 'Sistem', kind: 'system' },
    ],
    steps: [
      { id: 's1', label: 'Mulai', type: 'start', laneId: 'lane-c' },
      { id: 's2', label: 'Isi form', type: 'process', laneId: 'lane-c' },
      { id: 's3', label: 'Data valid?', type: 'decision', laneId: 'lane-s' },
      { id: 's4', label: 'Simpan', type: 'process', laneId: 'lane-s' },
      { id: 's5', label: 'Tinjau', type: 'decision', laneId: 'lane-a' },
      { id: 's6', label: 'Notifikasi', type: 'process', laneId: 'lane-s' },
      { id: 's7', label: 'Selesai', type: 'end', laneId: 'lane-c' },
      { id: 's8', label: 'Ditolak', type: 'end', laneId: 'lane-c' },
    ],
    edges: [
      { from: 's1', to: 's2' },
      { from: 's2', to: 's3' },
      { from: 's3', to: 's4', label: 'Ya' },
      { from: 's3', to: 's2', label: 'Tidak' }, // loop
      { from: 's4', to: 's5' },
      { from: 's5', to: 's6', label: 'Disetujui' },
      { from: 's5', to: 's8', label: 'Ditolak' },
      { from: 's6', to: 's7' },
    ],
  };
}

function rejects(mutate: (f: Flow) => void, messagePart: string) {
  const flow = validFlow();
  mutate(flow);
  const result = BusinessFlowSchema.safeParse(flow);
  assert.equal(result.success, false);
  const messages = result.success ? '' : result.error.issues.map((i) => i.message).join(' | ');
  assert.ok(messages.includes(messagePart), `pesan "${messagePart}" tidak ada di: ${messages}`);
}

test('flow valid dengan loop diterima', () => {
  assert.equal(BusinessFlowSchema.safeParse(validFlow()).success, true);
});

test('flow valid dengan merge diterima', () => {
  const flow = validFlow();
  // s3 -> s6 ikut menuju s6 sehingga s6 punya dua edge masuk (merge)
  flow.edges.push({ from: 's3', to: 's6', label: 'Lewati' });
  assert.equal(BusinessFlowSchema.safeParse(flow).success, true);
});

test('tanpa lane system ditolak', () => rejects((f) => (f.lanes[2].kind = 'human'), 'tepat 1 lane'));
test('laneId tidak dikenal ditolak', () => rejects((f) => (f.steps[1].laneId = 'lane-x'), 'tidak ada'));
test('lane kosong ditolak', () => rejects((f) => (f.steps[4].laneId = 'lane-c'), 'tidak dipakai'));
test('decision dengan satu cabang ditolak', () => rejects((f) => (f.edges = f.edges.filter((e: Flow) => !(e.from === 's3' && e.label === 'Tidak'))), 'minimal 2 edge'));
test('decision tanpa label ditolak', () => rejects((f) => delete f.edges[2].label, 'harus berlabel'));
test('dua start ditolak', () => rejects((f) => (f.steps[1].type = 'start'), 'tepat 1 step bertipe "start"'));
test('step tidak terjangkau ditolak', () =>
  rejects((f) => {
    f.steps.push({ id: 's9', label: 'Yatim', type: 'end', laneId: 'lane-c' });
  }, 'tidak dapat dicapai'));
test('edge ke step tidak ada ditolak', () => rejects((f) => f.edges.push({ from: 's6', to: 'zzz' }), 'tidak ada'));
test('edge duplikat ditolak', () => rejects((f) => f.edges.push({ from: 's1', to: 's2' }), 'duplikat'));
test('edge ke diri sendiri ditolak', () => rejects((f) => f.edges.push({ from: 's2', to: 's2' }), 'dirinya sendiri'));
