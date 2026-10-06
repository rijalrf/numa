import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeSwimlaneLayout, type BusinessFlow } from '../src/lib/flow-layout';

const flow: BusinessFlow = {
  processName: 'Alur Pemesanan',
  lanes: [
    { id: 'lane-s', name: 'Sistem', kind: 'system' },
    { id: 'lane-c', name: 'Pelanggan', kind: 'human' },
    { id: 'lane-a', name: 'Admin', kind: 'human' },
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
    { from: 's3', to: 's2', label: 'Tidak' },
    { from: 's4', to: 's5' },
    { from: 's5', to: 's6', label: 'Disetujui' },
    { from: 's5', to: 's8', label: 'Ditolak' },
    { from: 's6', to: 's7' },
  ],
};

test('start berada di rank paling atas', () => {
  const layout = computeSwimlaneLayout(flow);
  const start = layout.nodes.find((n) => n.id === 's1')!;
  assert.equal(start.rank, 0);
  assert.ok(layout.nodes.every((n) => n.y >= start.y));
});

test('node tidak bertumpuk', () => {
  const { nodes } = computeSwimlaneLayout(flow);
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
      assert.equal(overlap, false, `${a.id} bertumpuk dengan ${b.id}`);
    }
  }
});

test('setiap node berada di dalam kolom lane-nya', () => {
  const { nodes, lanes } = computeSwimlaneLayout(flow);
  for (const node of nodes) {
    const lane = lanes[node.laneIndex];
    assert.equal(lane.id, node.laneId);
    assert.ok(node.x >= lane.x && node.x + node.width <= lane.x + lane.width, `${node.id} keluar dari lane`);
  }
});

test('urutan lane: manusia, eksternal, lalu sistem', () => {
  const { lanes } = computeSwimlaneLayout(flow);
  assert.deepEqual(lanes.map((l) => l.id), ['lane-c', 'lane-a', 'lane-s']);
});

test('edge loop ditandai isBack, edge maju tidak', () => {
  const { edges } = computeSwimlaneLayout(flow);
  assert.equal(edges.find((e) => e.id === 's3->s2')!.isBack, true);
  assert.equal(edges.find((e) => e.id === 's1->s2')!.isBack, false);
  assert.equal(edges.length, flow.edges.length);
});

test('edge ortogonal dan berlabel di titik valid', () => {
  const { edges } = computeSwimlaneLayout(flow);
  for (const edge of edges) {
    for (let i = 0; i < edge.points.length - 1; i++) {
      const a = edge.points[i];
      const b = edge.points[i + 1];
      assert.ok(a.x === b.x || a.y === b.y, `edge ${edge.id} tidak ortogonal`);
    }
    assert.ok(Number.isFinite(edge.labelPos.x) && Number.isFinite(edge.labelPos.y));
  }
  assert.equal(edges.find((e) => e.id === 's3->s4')!.label, 'Ya');
});

test('flow kosong menghasilkan layout kosong', () => {
  assert.equal(computeSwimlaneLayout(null).nodes.length, 0);
});
