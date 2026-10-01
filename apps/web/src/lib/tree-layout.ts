// Algoritma tata letak pohon horizontal (pure function, tanpa React)
export type TreeNode = {
  id: string;
  projectId: string;
  parentId: string | null;
  label: string;
  kind: 'app' | 'feature' | 'subfeature' | 'task' | 'subtask';
  requirementIds?: string[];
  order: number;
};

export type ProcessedNode = TreeNode & {
  children: ProcessedNode[];
  parent?: ProcessedNode;
  level: number;
  leafCount: number;
  x: number;
  y: number;
};

export type TreeLine = { id: string; x1: number; y1: number; x2: number; y2: number };

export type TreeLayout = {
  roots: ProcessedNode[];
  allNodes: ProcessedNode[];
  lines: TreeLine[];
  width: number;
  height: number;
  nodeWidth: number;
  nodeHeight: number;
};

export type ViewMode = 'architecture' | 'full';

const EMPTY_LAYOUT: TreeLayout = {
  roots: [],
  allNodes: [],
  lines: [],
  width: 1200,
  height: 700,
  nodeWidth: 260,
  nodeHeight: 88,
};

export function getKindBadge(kind: TreeNode['kind']): { label: string; color: string } {
  switch (kind) {
    case 'app':
      return { label: 'Aplikasi', color: 'bg-primary/20 text-primary border-primary/30' };
    case 'feature':
      return { label: 'Fitur Utama', color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' };
    case 'subfeature':
      return { label: 'Sub-Fitur', color: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30' };
    case 'task':
      return { label: 'Task Teknis', color: 'bg-muted text-muted-foreground border-border' };
    case 'subtask':
      return { label: 'Sub-Task', color: 'bg-muted/60 text-muted-foreground border-border/60' };
  }
}

// Hitung tata letak pohon horizontal dengan kurva bezier modern
export function computeTreeLayout(nodes: TreeNode[], viewMode: ViewMode): TreeLayout {
  if (!nodes || nodes.length === 0) {
    return EMPTY_LAYOUT;
  }

  // Filter node berdasarkan mode tampilan
  const filteredRaw = nodes.filter((n) => {
    if (viewMode === 'architecture') {
      return n.kind === 'app' || n.kind === 'feature' || n.kind === 'subfeature';
    }
    return true;
  });

  const nodeMap = new Map<string, ProcessedNode>();
  for (const n of filteredRaw) {
    nodeMap.set(n.id, {
      ...n,
      children: [],
      level: 0,
      leafCount: 1,
      x: 0,
      y: 0,
    });
  }

  // Hubungkan relasi parent-child
  const roots: ProcessedNode[] = [];
  for (const n of filteredRaw) {
    const current = nodeMap.get(n.id)!;
    if (n.parentId && nodeMap.has(n.parentId)) {
      const parent = nodeMap.get(n.parentId)!;
      current.parent = parent;
      parent.children.push(current);
    } else {
      roots.push(current);
    }
  }

  // 1. Hitung bobot vertikal (leaf count)
  function computeLeafCount(node: ProcessedNode): number {
    if (node.children.length === 0) {
      node.leafCount = 1;
      return 1;
    }
    node.leafCount = node.children.reduce((acc, child) => acc + computeLeafCount(child), 0);
    return node.leafCount;
  }

  for (const root of roots) {
    computeLeafCount(root);
  }

  // 2. Tentukan posisi node (x, y) - nodeHeight diperbesar menjadi 88 agar teks 2 baris tidak terpotong
  const nodeWidth = 260;
  const nodeHeight = 88;
  const gapX = 120;
  const gapY = 24;
  const slotHeight = nodeHeight + gapY;

  function assignPositions(node: ProcessedNode, startY: number, level: number) {
    node.level = level;
    node.x = level * (nodeWidth + gapX);

    if (node.children.length === 0) {
      node.y = startY + nodeHeight / 2;
    } else {
      let currentY = startY;
      for (const child of node.children) {
        assignPositions(child, currentY, level + 1);
        currentY += child.leafCount * slotHeight;
      }
      const firstChildY = node.children[0].y;
      const lastChildY = node.children[node.children.length - 1].y;
      node.y = (firstChildY + lastChildY) / 2;
    }
  }

  let startRootY = 30;
  for (const root of roots) {
    assignPositions(root, startRootY, 0);
    startRootY += root.leafCount * slotHeight + gapY;
  }

  // 3. Kumpulkan garis penghubung dan seluruh node
  const lines: TreeLine[] = [];
  const allProcessed: ProcessedNode[] = [];

  function collectLinesAndNodes(node: ProcessedNode) {
    allProcessed.push(node);
    for (const child of node.children) {
      lines.push({
        id: `${node.id}-${child.id}`,
        x1: node.x + nodeWidth,
        y1: node.y,
        x2: child.x,
        y2: child.y,
      });
      collectLinesAndNodes(child);
    }
  }

  for (const root of roots) {
    collectLinesAndNodes(root);
  }

  let maxX = 0;
  let maxY = 0;
  for (const node of allProcessed) {
    if (node.x + nodeWidth > maxX) maxX = node.x + nodeWidth;
    if (node.y + nodeHeight > maxY) maxY = node.y + nodeHeight;
  }

  return {
    roots,
    allNodes: allProcessed,
    lines,
    width: Math.max(maxX + 160, 1400),
    height: Math.max(maxY + 140, 750),
    nodeWidth,
    nodeHeight,
  };
}
