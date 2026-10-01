// Tree Diagram page: Visualisasi diagram arsitektur pohon modern horizontal (full-width & interaktif)
import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Layers,
  Lock,
  Maximize2,
  Minimize2,
  ListTree,
} from 'lucide-react';
import { NumaLoader } from '@/components/ui/numa-loader';
import { api } from '@/lib/http';
import { pollAiJob } from '@/lib/ai-job';
import { cn } from '@/lib/utils';
import { isStageLocked } from '@/lib/constants';
import { useWizardNav } from '@/components/layout/wizard-nav';
import { computeTreeLayout, type TreeNode, type ProcessedNode } from '@/lib/tree-layout';
import { useTreePanZoom } from '@/hooks/use-tree-pan-zoom';
import { TreeNodeCard } from '@/components/tree/tree-node-card';
import { TreeEdgeLine } from '@/components/tree/tree-edge-line';
import { NodeDetailDialog } from '@/components/tree/node-detail-dialog';

export function TreePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [nodes, setNodes] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [selectedNode, setSelectedNode] = useState<ProcessedNode | null>(null);
  const [viewMode, setViewMode] = useState<'architecture' | 'full'>('architecture');

  const {
    zoom,
    pan,
    isPanning,
    isFullscreen,
    containerRef,
    canvasWrapperRef,
    toggleFullscreen,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleZoom,
    handleResetView,
  } = useTreePanZoom();

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
      // Job berjalan di background — poll sampai node tersimpan di database
      pollAiJob(projectId, 'tree_generate', {
        onDone: async () => {
          const refresh = await api<{ nodes?: TreeNode[] }>(`/api/projects/${projectId}/tree`);
          setNodes(refresh.nodes || []);
          setGenerating(false);
          setLoading(false);
        },
        onFailed: (error) => {
          console.error('Error generate tree:', error);
          alert(error || 'Gagal membuat diagram struktur aplikasi.');
          setGenerating(false);
          setLoading(false);
        },
        onTimeout: () => {
          alert('Proses pembuatan diagram memakan waktu lama. Silakan muat ulang halaman.');
          setGenerating(false);
          setLoading(false);
        },
      });
    } catch (err) {
      console.error('Error generate tree:', err);
      alert('Gagal membuat diagram struktur aplikasi.');
      setGenerating(false);
      setLoading(false);
    }
  };

  const layout = useMemo(() => computeTreeLayout(nodes, viewMode), [nodes, viewMode]);

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

  useWizardNav(
    loading || generating
      ? null
      : {
          back: {
            label: 'Kembali',
            onClick: handleBackToPrd,
          },
          next: {
            label: 'Lanjut',
            onClick: () => navigate(`/projects/${projectId}/board`),
          },
        }
  );

  if (loading || generating) {
    return (
      <div className="flex-1 w-full h-[calc(100vh-4rem)] flex items-center justify-center bg-background">
        <NumaLoader
          label="Menyusun diagram dekomposisi..."
          sublabel="AI sedang memetakan hierarki pohon fitur dan rincian modul teknis"
        />
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
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-background/90 backdrop-blur-md border border-border/80 rounded-md text-xs text-muted-foreground shadow-md">
            <Lock className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="font-medium">Terkunci (Read-Only)</span>
          </div>
        )}

        <div className="flex items-center gap-1 bg-background/90 backdrop-blur-md border border-border/80 p-1 rounded-md shadow-md text-xs">
          <Badge variant="outline" className="text-xs px-2.5 py-1 font-normal border-0 text-muted-foreground">
            Total {nodes.length} Simpul
          </Badge>
          <div className="h-4 w-px bg-border mx-0.5" />
          <button
            type="button"
            onClick={() => setViewMode('architecture')}
            className={cn(
              'px-3 py-1 rounded-md font-medium transition-colors flex items-center gap-1.5 cursor-pointer',
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
              'px-3 py-1 rounded-md font-medium transition-colors flex items-center gap-1.5 cursor-pointer',
              viewMode === 'full'
                ? 'bg-primary/15 text-primary font-semibold shadow-2xs'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <ListTree className="h-3.5 w-3.5" />
            <span>Semua Simpul</span>
          </button>
        </div>
      </div>

      {/* Floating Controls HUD (Kanan Atas) */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-1.5 bg-background/90 backdrop-blur-md border border-border/80 p-1.5 rounded-md shadow-md">
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
      <div className="absolute bottom-4 left-4 z-20 pointer-events-none text-xs text-muted-foreground bg-background/90 backdrop-blur-md px-3 py-1.5 rounded-md border border-border/70 shadow-xs flex items-center gap-2">
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
            {layout.lines.map((line) => (
              <TreeEdgeLine key={line.id} line={line} />
            ))}
          </svg>

          {/* Layer Kartu Node Interaktif Modern */}
          {layout.allNodes.map((node) => (
            <TreeNodeCard
              key={node.id}
              node={node}
              nodeWidth={layout.nodeWidth || 260}
              nodeHeight={layout.nodeHeight || 88}
              onClick={setSelectedNode}
            />
          ))}
        </div>
      </div>

      {/* Modal Detail Node (Read-Only) */}
      {selectedNode && (
        <NodeDetailDialog
          node={selectedNode}
          onSelect={setSelectedNode}
          onClose={() => setSelectedNode(null)}
        />
      )}
    </div>
  );
}
