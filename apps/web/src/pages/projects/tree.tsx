// Tree Diagram page: Visualisasi diagram arsitektur pohon modern horizontal (full-width & interaktif)
import { useEffect, useState, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Loader2,
  ArrowRight,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  X,
  Layers,
  ChevronRight,
  Sparkles,
  Laptop,
  CheckCircle2,
  ListTree,
  Lock,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { api } from '@/lib/http';
import { cn } from '@/lib/utils';
import { isStageLocked } from '@/lib/constants';
import { useWizardNav } from '@/components/layout/wizard-nav';

type TreeNode = {
  id: string;
  projectId: string;
  parentId: string | null;
  label: string;
  kind: 'app' | 'feature' | 'subfeature' | 'task' | 'subtask';
  requirementIds?: string[];
  order: number;
};

type ProcessedNode = TreeNode & {
  children: ProcessedNode[];
  parent?: ProcessedNode;
  level: number;
  leafCount: number;
  x: number;
  y: number;
};

export function TreePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [nodes, setNodes] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [selectedNode, setSelectedNode] = useState<ProcessedNode | null>(null);
  const [viewMode, setViewMode] = useState<'architecture' | 'full'>('architecture');

  // Pan dan Zoom state
  const [zoom, setZoom] = useState(0.95);
  const [pan, setPan] = useState({ x: 40, y: 30 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      canvasWrapperRef.current?.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  };

  // Load atau generate tree
  useEffect(() => {
    if (!projectId) return;

    const loadOrGenerateTree = async () => {
      try {
        const projectRes = await api<{ project?: { wizardStep?: string } }>(`/api/projects/${projectId}`);
        const currentStep = projectRes.project?.wizardStep || 'tree';
        const locked = isStageLocked(currentStep, 'tree');
        setIsLocked(locked);

        const json = await api<{ nodes?: TreeNode[] }>(`/api/projects/${projectId}/tree`);
        if (json.nodes && json.nodes.length > 0) {
          setNodes(json.nodes);
        } else if (!locked) {
          await generateTree();
        }
      } catch (err) {
        console.error('Gagal memuat tree:', err);
      } finally {
        setLoading(false);
      }
    };

    loadOrGenerateTree();
  }, [projectId]);

  const generateTree = async () => {
    if (!projectId || isLocked) return;
    setGenerating(true);

    try {
      await api(`/api/projects/${projectId}/tree/generate`, { method: 'POST' });
      const refresh = await api<{ nodes?: TreeNode[] }>(`/api/projects/${projectId}/tree`);
      setNodes(refresh.nodes || []);
    } catch (err) {
      console.error('Error generate tree:', err);
      alert('Gagal membuat diagram struktur aplikasi.');
    } finally {
      setGenerating(false);
      setLoading(false);
    }
  };

  // Hitung tata letak pohon horizontal dengan kurva bezier modern
  const layout = useMemo(() => {
    if (!nodes || nodes.length === 0) {
      return { roots: [], allNodes: [], lines: [], width: 1200, height: 700, nodeWidth: 260, nodeHeight: 88 };
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
    const lines: Array<{ id: string; x1: number; y1: number; x2: number; y2: number }> = [];
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
  }, [nodes, viewMode]);

  // Handler Pan (Drag Canvas)
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.tree-node-card')) return;
    setIsPanning(true);
    setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning) return;
    setPan({
      x: e.clientX - panStart.x,
      y: e.clientY - panStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  const handleZoom = (delta: number) => {
    setZoom((prev) => Math.min(Math.max(Number((prev + delta).toFixed(2)), 0.4), 1.8));
  };

  const handleResetView = () => {
    setZoom(0.95);
    setPan({ x: 40, y: 30 });
  };

  const getKindBadge = (kind: TreeNode['kind']) => {
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
  };

  const handleBackToPrd = async () => {
    if (!projectId) return;
    try {
      await api(`/api/projects/${projectId}/wizard-step`, {
        method: 'POST',
        body: JSON.stringify({ step: 'prd' }),
      });
      navigate(`/projects/${projectId}/prd`);
    } catch {
      navigate(`/projects/${projectId}/prd`);
    }
  };

  useWizardNav({
    back: {
      label: 'Kembali',
      onClick: handleBackToPrd,
    },
    next: {
      label: 'Lanjut',
      onClick: () => navigate(`/projects/${projectId}/board`),
    },
  });

  if (loading || generating) {
    return (
      <div className="flex-1 w-full h-full min-h-[400px] flex flex-col items-center justify-center space-y-4 bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <div className="text-center space-y-1">
          <p className="text-sm font-medium text-foreground">
            Menyusun diagram struktur arsitektur aplikasi...
          </p>
          <p className="text-xs text-muted-foreground">
            AI sedang memetakan hierarki pohon fitur dan rincian modul teknis
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={canvasWrapperRef}
      className="flex-1 w-full h-full min-h-0 flex flex-col relative overflow-hidden bg-card select-none"
    >
      {/* Floating Toolbar & Status (Kiri Atas) */}
      <div className="absolute top-4 left-4 z-20 flex items-center gap-2 flex-wrap max-w-[calc(100%-240px)]">
        {isLocked && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-background/90 backdrop-blur-md border border-border/80 rounded-xl text-xs text-muted-foreground shadow-md">
            <Lock className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="font-medium">Terkunci (Read-Only)</span>
          </div>
        )}

        <div className="flex items-center gap-1 bg-background/90 backdrop-blur-md border border-border/80 p-1 rounded-xl shadow-md text-xs">
          <Badge variant="outline" className="text-xs px-2.5 py-1 font-normal border-0 text-muted-foreground">
            Total {nodes.length} Simpul
          </Badge>
          <div className="h-4 w-px bg-border mx-0.5" />
          <button
            type="button"
            onClick={() => setViewMode('architecture')}
            className={cn(
              'px-3 py-1 rounded-lg font-medium transition-colors flex items-center gap-1.5 cursor-pointer',
              viewMode === 'architecture'
                ? 'bg-primary/15 text-primary font-semibold shadow-2xs'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Arsitektur Fitur</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('full')}
            className={cn(
              'px-3 py-1 rounded-lg font-medium transition-colors flex items-center gap-1.5 cursor-pointer',
              viewMode === 'full'
                ? 'bg-primary/15 text-primary font-semibold shadow-2xs'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <ListTree className="h-3.5 w-3.5" />
            <span>Semua Task ({nodes.length})</span>
          </button>
        </div>
      </div>

      {/* Floating Controls HUD (Kanan Atas) */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-1.5 bg-background/90 backdrop-blur-md border border-border/80 p-1.5 rounded-xl shadow-md">
        <Button
          size="icon"
          variant="ghost"
          onClick={() => handleZoom(0.15)}
          className="h-8 w-8 hover:bg-accent cursor-pointer"
          title="Perbesar (Zoom In)"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => handleZoom(-0.15)}
          className="h-8 w-8 hover:bg-accent cursor-pointer"
          title="Perkecil (Zoom Out)"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <div className="h-4 w-px bg-border mx-0.5" />
        <Button
          size="icon"
          variant="ghost"
          onClick={handleResetView}
          className="h-8 w-8 hover:bg-accent cursor-pointer"
          title="Reset Posisi & Skala"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
        <span className="text-xs text-muted-foreground px-1.5 font-mono font-medium min-w-[40px] text-center">
          {Math.round(zoom * 100)}%
        </span>
        <div className="h-4 w-px bg-border mx-0.5" />
        <Button
          size="icon"
          variant="ghost"
          onClick={toggleFullscreen}
          className="h-8 w-8 hover:bg-accent cursor-pointer"
          title={isFullscreen ? 'Keluar Layar Penuh' : 'Layar Penuh (Full Screen)'}
        >
          {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </Button>
      </div>

      {/* Floating Hint (Kiri Bawah) */}
      <div className="absolute bottom-4 left-4 z-20 pointer-events-none text-xs text-muted-foreground bg-background/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-border/70 shadow-xs flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-primary" />
        <span>Geser kanvas (drag) untuk bernavigasi • Klik kartu untuk rincian</span>
      </div>

      {/* Viewport Drag & Zoom (Full Screen) */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className={cn(
          'flex-1 w-full h-full min-h-0 overflow-hidden select-none relative',
          isPanning ? 'cursor-grabbing' : 'cursor-grab'
        )}
      >
          <div
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: '0 0',
              width: `${layout.width}px`,
              height: `${layout.height}px`,
            }}
            className="relative transition-transform duration-75 ease-out"
          >
            {/* Background Grid Pattern Modern */}
            <svg
              className="absolute inset-0 pointer-events-none opacity-40 dark:opacity-30"
              width={layout.width}
              height={layout.height}
            >
              <defs>
                <pattern id="tree-dot-grid" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
                  <circle cx="2" cy="2" r="1.2" className="fill-foreground/20" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#tree-dot-grid)" />
            </svg>

            {/* Layer Garis Bezier Penghubung Modern */}
            <svg
              className="absolute inset-0 pointer-events-none"
              width={layout.width}
              height={layout.height}
              style={{ overflow: 'visible' }}
            >
              {layout.lines.map((line) => {
                const dx = (line.x2 - line.x1) * 0.5;
                const pathD = `M ${line.x1} ${line.y1} C ${line.x1 + dx} ${line.y1}, ${line.x2 - dx} ${line.y2}, ${line.x2} ${line.y2}`;

                return (
                  <g key={line.id}>
                    {/* Bayangan garis halus */}
                    <path
                      d={pathD}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="4"
                      className="text-primary/10 dark:text-primary/15"
                    />
                    {/* Garis utama bezier */}
                    <path
                      d={pathD}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="text-border dark:text-border hover:text-primary transition-colors"
                    />
                    {/* Titik anchor di ujung anak */}
                    <circle
                      cx={line.x2}
                      cy={line.y2}
                      r="3.5"
                      className="fill-primary stroke-background"
                      strokeWidth="1.5"
                    />
                  </g>
                );
              })}
            </svg>

            {/* Layer Kartu Node Interaktif Modern */}
            {layout.allNodes.map((node) => {
              const badge = getKindBadge(node.kind);
              const isApp = node.kind === 'app';
              const isFeature = node.kind === 'feature';

              return (
                <div
                  key={node.id}
                  onClick={() => setSelectedNode(node)}
                  style={{
                    position: 'absolute',
                    left: `${node.x}px`,
                    top: `${node.y - (layout.nodeHeight || 88) / 2}px`,
                    width: `${layout.nodeWidth || 260}px`,
                    height: `${layout.nodeHeight || 88}px`,
                  }}
                  className={cn(
                    'tree-node-card cursor-pointer rounded-xl p-3 flex flex-col justify-between transition-all duration-200',
                    'hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.98]',
                    isApp
                      ? 'bg-gradient-to-br from-primary to-primary/90 text-primary-foreground border border-primary/50 shadow-md shadow-primary/20 ring-1 ring-primary/30'
                      : isFeature
                      ? 'bg-card hover:bg-accent/40 text-card-foreground border-2 border-primary/40 hover:border-primary shadow-xs hover:shadow-md'
                      : 'bg-card hover:bg-accent/40 text-card-foreground border border-border hover:border-primary/50 shadow-2xs hover:shadow-sm'
                  )}
                  title={`${badge.label}: ${node.label}`}
                >
                  {/* Header Kartu Node */}
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {isApp ? (
                        <Laptop className="h-3.5 w-3.5 shrink-0 opacity-90" />
                      ) : isFeature ? (
                        <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
                      ) : (
                        <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <span
                        className={cn(
                          'text-[10px] uppercase font-semibold tracking-wider truncate',
                          isApp ? 'text-primary-foreground/90' : 'text-primary'
                        )}
                      >
                        {badge.label}
                      </span>
                    </div>

                    {node.children.length > 0 && (
                      <span
                        className={cn(
                          'text-[10px] px-1.5 py-0.5 rounded-full font-mono font-medium',
                          isApp
                            ? 'bg-primary-foreground/20 text-primary-foreground'
                            : 'bg-muted text-muted-foreground'
                        )}
                      >
                        {node.children.length} sub
                      </span>
                    )}
                  </div>

                  {/* Judul Node */}
                  <div
                    className={cn(
                      'text-xs font-semibold leading-snug line-clamp-2 break-words',
                      isApp ? 'text-primary-foreground' : 'text-foreground'
                    )}
                  >
                    {node.label}
                  </div>

                  {/* Badges Requirement ID */}
                  {node.requirementIds && node.requirementIds.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {node.requirementIds.slice(0, 2).map((reqId) => (
                        <span
                          key={reqId}
                          className={cn(
                            'text-[9px] font-mono px-1 py-0.5 rounded font-semibold',
                            isApp
                              ? 'bg-primary-foreground/20 text-primary-foreground'
                              : 'bg-primary/10 text-primary border border-primary/20'
                          )}
                        >
                          {reqId}
                        </span>
                      ))}
                      {node.requirementIds.length > 2 && (
                        <span
                          className={cn(
                            'text-[9px] font-mono font-medium',
                            isApp ? 'text-primary-foreground/80' : 'text-muted-foreground'
                          )}
                        >
                          +{node.requirementIds.length - 2}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Modal Detail Node (Read-Only) */}
      {selectedNode &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
            onClick={() => setSelectedNode(null)}
          >
            <div
              className="bg-card border border-border rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4 relative animate-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Tombol Tutup */}
              <button
                type="button"
                onClick={() => setSelectedNode(null)}
                className="absolute top-4 right-4 text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted transition-colors"
              >
                <X className="h-5 w-5" />
              </button>

              {/* Header Dialog */}
              <div className="space-y-1.5 pr-6">
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={cn('text-xs font-semibold uppercase', getKindBadge(selectedNode.kind).color)}
                  >
                    {getKindBadge(selectedNode.kind).label}
                  </Badge>
                  <span className="text-xs text-muted-foreground font-mono">
                    Order #{selectedNode.order}
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-foreground leading-snug">
                  {selectedNode.label}
                </h3>
              </div>

              {/* Rincian Hierarki */}
              <div className="space-y-3.5 text-sm pt-3 border-t border-border">
                {selectedNode.parent ? (
                  <div>
                    <span className="text-xs font-medium text-muted-foreground block mb-1">
                      Induk (Parent Node):
                    </span>
                    <div
                      onClick={() => setSelectedNode(selectedNode.parent!)}
                      className="p-3 rounded-xl bg-muted/40 hover:bg-muted/80 border border-border flex items-center justify-between cursor-pointer transition-colors"
                    >
                      <span className="text-xs font-medium text-foreground truncate mr-2">
                        {selectedNode.parent.label}
                      </span>
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {getKindBadge(selectedNode.parent.kind).label}
                      </Badge>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground italic flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                    <span>Node ini adalah Root Aplikasi (puncak arsitektur).</span>
                  </div>
                )}

                {/* Badges Requirement ID */}
                {selectedNode.requirementIds && selectedNode.requirementIds.length > 0 && (
                  <div>
                    <span className="text-xs font-medium text-muted-foreground block mb-1">
                      Terkait Requirement PRD:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedNode.requirementIds.map((reqId) => (
                        <Badge
                          key={reqId}
                          variant="outline"
                          className="font-mono text-xs bg-primary/10 text-primary border-primary/20"
                        >
                          {reqId}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Daftar Sub-komponen */}
                <div>
                  <span className="text-xs font-medium text-muted-foreground block mb-1.5">
                    Sub-Komponen Langsung ({selectedNode.children.length}):
                  </span>
                  {selectedNode.children.length > 0 ? (
                    <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
                      {selectedNode.children.map((child) => (
                        <div
                          key={child.id}
                          onClick={() => setSelectedNode(child)}
                          className="p-2.5 rounded-xl bg-muted/20 hover:bg-muted/60 border border-border/60 text-xs flex items-center justify-between cursor-pointer transition-colors"
                        >
                          <div className="flex items-center gap-2 min-w-0 pr-2">
                            <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                            <span className="font-medium text-foreground truncate">
                              {child.label}
                            </span>
                          </div>
                          <Badge variant="outline" className="text-[10px] shrink-0">
                            {getKindBadge(child.kind).label}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic py-1">
                      Tidak memiliki sub-komponen (node daun).
                    </p>
                  )}
                </div>

                <div className="rounded-xl bg-muted/40 p-3 text-[11px] text-muted-foreground">
                  Detail struktur ini bersifat <strong>read-only</strong>. Seluruh task pengerjaan otomatis tersedia pada Board Task dan dapat dijalankan melalui CLI <code>numa</code>.
                </div>
              </div>

              {/* Footer Dialog */}
              <div className="flex justify-end pt-2 border-t border-border">
                <Button size="sm" onClick={() => setSelectedNode(null)}>
                  Tutup
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
