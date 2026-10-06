// Tata letak diagram alur bisnis swimlane: atas ke bawah, satu kolom per persona (lane)
import dagre from 'dagre';

export type FlowLane = {
  id: string;
  name: string;
  kind: 'human' | 'system' | 'external';
  description?: string;
};

export type FlowStep = {
  id: string;
  label: string;
  type: 'start' | 'process' | 'decision' | 'end';
  laneId: string;
  requirementIds?: string[];
};

export type FlowEdge = { from: string; to: string; label?: string | null };

export type BusinessFlow = {
  processName: string;
  lanes: FlowLane[];
  steps: FlowStep[];
  edges: FlowEdge[];
};

export type LaneBox = FlowLane & { index: number; x: number; width: number };

export type FlowNodeBox = FlowStep & {
  x: number;
  y: number;
  width: number;
  height: number;
  rank: number;
  laneIndex: number;
};

export type Point = { x: number; y: number };

export type FlowEdgePath = {
  id: string;
  from: string;
  to: string;
  label: string | null;
  points: Point[];
  labelPos: Point;
  isBack: boolean;
};

export type SwimlaneLayout = {
  lanes: LaneBox[];
  nodes: FlowNodeBox[];
  edges: FlowEdgePath[];
  width: number;
  height: number;
  headerHeight: number;
};

export const FLOW_LAYOUT = {
  nodeWidth: 220,
  nodeHeight: 72,
  gapX: 32,
  gapY: 56,
  lanePadding: 28,
  headerHeight: 44,
  margin: 24,
  portGap: 22,
} as const;

const EMPTY_LAYOUT: SwimlaneLayout = {
  lanes: [],
  nodes: [],
  edges: [],
  width: 800,
  height: 500,
  headerHeight: FLOW_LAYOUT.headerHeight,
};

// Urutan kolom: persona manusia, layanan eksternal, lalu Sistem di paling kanan
const LANE_KIND_ORDER: Record<FlowLane['kind'], number> = { human: 0, external: 1, system: 2 };

function spread(count: number, index: number): number {
  const maxOffset = FLOW_LAYOUT.nodeWidth / 2 - 16;
  const offset = (index - (count - 1) / 2) * FLOW_LAYOUT.portGap;
  return Math.max(-maxOffset, Math.min(maxOffset, offset));
}

// Titik tengah segmen terpanjang, tempat label edge diletakkan
function labelPosition(points: Point[]): Point {
  let best = { length: -1, from: points[0], to: points[points.length - 1] };
  for (let i = 0; i < points.length - 1; i++) {
    const length = Math.abs(points[i + 1].x - points[i].x) + Math.abs(points[i + 1].y - points[i].y);
    if (length > best.length) best = { length, from: points[i], to: points[i + 1] };
  }
  return { x: (best.from.x + best.to.x) / 2, y: (best.from.y + best.to.y) / 2 };
}

export function computeSwimlaneLayout(flow: BusinessFlow | null): SwimlaneLayout {
  if (!flow || flow.steps.length === 0) return EMPTY_LAYOUT;

  const { nodeWidth, nodeHeight, gapX, gapY, lanePadding, headerHeight, margin } = FLOW_LAYOUT;

  // 1. Rank vertikal dari dagre (siklus ditangani dagre dengan membalik edge sementara)
  const stepIds = new Set(flow.steps.map((s) => s.id));
  const edges = flow.edges.filter((e) => e.from !== e.to && stepIds.has(e.from) && stepIds.has(e.to));

  const graph = new dagre.graphlib.Graph();
  graph.setGraph({ rankdir: 'TB', ranksep: 40, nodesep: 40 });
  graph.setDefaultEdgeLabel(() => ({}));
  for (const step of flow.steps) graph.setNode(step.id, { width: nodeWidth, height: nodeHeight });
  for (const edge of edges) graph.setEdge(edge.from, edge.to);
  dagre.layout(graph);

  const distinctY = [...new Set(flow.steps.map((s) => Math.round(graph.node(s.id).y)))].sort((a, b) => a - b);
  const rankOf = new Map<string, number>();
  for (const step of flow.steps) rankOf.set(step.id, distinctY.indexOf(Math.round(graph.node(step.id).y)));
  const rankCount = distinctY.length;

  // 2. Urutan lane dan jumlah sub-kolom per lane (node dengan lane dan rank sama berdampingan)
  const orderedLanes = flow.lanes
    .map((lane, originalIndex) => ({ lane, originalIndex }))
    .sort((a, b) => LANE_KIND_ORDER[a.lane.kind] - LANE_KIND_ORDER[b.lane.kind] || a.originalIndex - b.originalIndex)
    .map((entry) => entry.lane);
  const laneIndexOf = new Map(orderedLanes.map((lane, i) => [lane.id, i]));

  const groups = new Map<string, FlowStep[]>();
  for (const step of flow.steps) {
    if (!laneIndexOf.has(step.laneId)) continue;
    const key = `${step.laneId}|${rankOf.get(step.id)}`;
    groups.set(key, [...(groups.get(key) ?? []), step]);
  }
  for (const group of groups.values()) group.sort((a, b) => graph.node(a.id).x - graph.node(b.id).x);

  const subColumns = orderedLanes.map((lane) => {
    let max = 1;
    for (const [key, group] of groups) if (key.startsWith(`${lane.id}|`)) max = Math.max(max, group.length);
    return max;
  });

  let cursorX = margin;
  const lanes: LaneBox[] = orderedLanes.map((lane, index) => {
    const width = subColumns[index] * nodeWidth + (subColumns[index] - 1) * gapX + 2 * lanePadding;
    const box = { ...lane, index, x: cursorX, width };
    cursorX += width;
    return box;
  });

  // 3. Posisi node
  const top = headerHeight + 28;
  const nodes: FlowNodeBox[] = [];
  for (const group of groups.values()) {
    group.forEach((step, subIndex) => {
      const laneIndex = laneIndexOf.get(step.laneId)!;
      const rank = rankOf.get(step.id)!;
      nodes.push({
        ...step,
        x: lanes[laneIndex].x + lanePadding + subIndex * (nodeWidth + gapX),
        y: top + rank * (nodeHeight + gapY),
        width: nodeWidth,
        height: nodeHeight,
        rank,
        laneIndex,
      });
    });
  }
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const centerX = (n: FlowNodeBox) => n.x + n.width / 2;

  // 4. Port edge disebar agar edge keluar/masuk node yang sama tidak menumpuk
  const outgoing = new Map<string, FlowEdge[]>();
  const incoming = new Map<string, FlowEdge[]>();
  for (const edge of edges) {
    if (!nodeById.has(edge.from) || !nodeById.has(edge.to)) continue;
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge]);
    incoming.set(edge.to, [...(incoming.get(edge.to) ?? []), edge]);
  }
  for (const list of outgoing.values()) list.sort((a, b) => centerX(nodeById.get(a.to)!) - centerX(nodeById.get(b.to)!));
  for (const list of incoming.values()) list.sort((a, b) => centerX(nodeById.get(a.from)!) - centerX(nodeById.get(b.from)!));

  const corridors = [...lanes.map((l) => l.x), cursorX];
  const nearestCorridor = (x: number) => corridors.reduce((best, c) => (Math.abs(c - x) < Math.abs(best - x) ? c : best));

  // 5. Rute ortogonal: edge antar-rank bersebelahan lewat satu siku, selebihnya (edge panjang
  // dan edge balik/loop) lewat koridor di batas lane yang bebas dari node
  const paths: FlowEdgePath[] = [];
  edges.forEach((edge, k) => {
    const source = nodeById.get(edge.from);
    const target = nodeById.get(edge.to);
    if (!source || !target) return;

    const outList = outgoing.get(edge.from)!;
    const inList = incoming.get(edge.to)!;
    const sx = centerX(source) + spread(outList.length, outList.indexOf(edge));
    const tx = centerX(target) + spread(inList.length, inList.indexOf(edge));
    const sourceBottom = source.y + source.height;
    const targetTop = target.y;
    const isBack = target.rank <= source.rank;
    const jitter = ((k % 4) - 1.5) * 4;

    let points: Point[];
    if (!isBack && target.rank - source.rank === 1) {
      const midY = sourceBottom + gapY / 2 + jitter;
      points = [
        { x: sx, y: sourceBottom },
        { x: sx, y: midY },
        { x: tx, y: midY },
        { x: tx, y: targetTop },
      ];
    } else {
      const mid = Math.abs(sx - tx) < 1 ? sx + lanes[source.laneIndex].width / 2 : (sx + tx) / 2;
      const corridorX = nearestCorridor(mid) + ((k % 5) - 2) * 5;
      const y1 = sourceBottom + gapY / 2 + jitter;
      const y2 = targetTop - gapY / 2 + jitter;
      points = [
        { x: sx, y: sourceBottom },
        { x: sx, y: y1 },
        { x: corridorX, y: y1 },
        { x: corridorX, y: y2 },
        { x: tx, y: y2 },
        { x: tx, y: targetTop },
      ];
    }

    paths.push({
      id: `${edge.from}->${edge.to}`,
      from: edge.from,
      to: edge.to,
      label: edge.label?.trim() ? edge.label.trim() : null,
      points,
      labelPos: labelPosition(points),
      isBack,
    });
  });

  return {
    lanes,
    nodes,
    edges: paths,
    width: cursorX + margin,
    height: top + rankCount * (nodeHeight + gapY) + margin,
    headerHeight,
  };
}
