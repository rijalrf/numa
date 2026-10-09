// CycleBar: Komponen pengalih siklus di papan Kanban.
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  GitBranch,
  ChevronDown,
} from 'lucide-react';
import type { ProjectCycleItem } from '@/lib/cycle';

interface CycleBarProps {
  cycles: ProjectCycleItem[];
  activeCycleId: string | null | 'all';
  onSelectCycle: (cycleId: string | null | 'all') => void;
  initialTaskCounts: { total: number; done: number };
}

export function CycleBar({
  cycles,
  activeCycleId,
  onSelectCycle,
  initialTaskCounts,
}: CycleBarProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Label tombol dropdown aktif
  const currentLabel = (() => {
    if (activeCycleId === 'all') return 'Semua Siklus';
    if (activeCycleId === null) {
      return `Pembangunan Awal (${initialTaskCounts.done}/${initialTaskCounts.total} task)`;
    }
    const found = cycles.find((c) => c.id === activeCycleId);
    if (!found) return 'Pilih Siklus';
    return `Siklus #${found.number}: ${found.title}`;
  })();

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      {/* Dropdown pemilih siklus */}
      <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-2 font-medium text-xs border-border/80 bg-background hover:bg-muted/40"
          >
            <GitBranch className="h-3.5 w-3.5 text-primary" />
            <span className="max-w-[240px] truncate">{currentLabel}</span>
            <ChevronDown className="h-3 w-3 text-muted-foreground ml-0.5" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-80 p-1">
          <DropdownMenuLabel className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
            Riwayat Siklus
          </DropdownMenuLabel>

          {/* Opsi 1: Semua Siklus */}
          <DropdownMenuItem
            onClick={() => {
              onSelectCycle('all');
              setDropdownOpen(false);
            }}
            className={`flex items-center justify-between text-xs py-2 cursor-pointer ${
              activeCycleId === 'all' ? 'bg-primary/10 text-primary font-medium' : ''
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="font-medium">Semua Siklus</span>
            </div>
            <Badge variant="outline" className="text-[10px] h-4 px-1">
              Semua
            </Badge>
          </DropdownMenuItem>

          {/* Opsi 2: Pembangunan Awal */}
          <DropdownMenuItem
            onClick={() => {
              onSelectCycle(null);
              setDropdownOpen(false);
            }}
            className={`flex items-center justify-between text-xs py-2 cursor-pointer ${
              activeCycleId === null ? 'bg-primary/10 text-primary font-medium' : ''
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="font-medium">Pembangunan Awal</span>
            </div>
            <span className="text-[11px] text-muted-foreground font-mono">
              {initialTaskCounts.done}/{initialTaskCounts.total}
            </span>
          </DropdownMenuItem>

          {cycles.length > 0 && <DropdownMenuSeparator />}

          {/* Daftar siklus lanjutan */}
          {cycles.map((c) => {
            const isSelected = activeCycleId === c.id;
            const isDone = c.status === 'DONE';
            const isOpen = c.status === 'OPEN';

            return (
              <DropdownMenuItem
                key={c.id}
                onClick={() => {
                  onSelectCycle(c.id);
                  setDropdownOpen(false);
                }}
                className={`flex items-center justify-between gap-2 text-xs py-2 cursor-pointer ${
                  isSelected ? 'bg-primary/10 text-primary font-medium' : ''
                }`}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="font-semibold text-muted-foreground shrink-0">
                    #{c.number}
                  </span>
                  <span className="truncate">{c.title}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Badge
                    variant={isDone ? 'success' : isOpen ? 'default' : 'outline'}
                    className={`text-[10px] h-4 px-1.5 ${
                      isDone
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                        : isOpen
                        ? 'bg-primary/20 text-primary border-primary/30'
                        : ''
                    }`}
                  >
                    {isDone ? 'Selesai' : isOpen ? 'Terbuka' : 'Draf'}
                  </Badge>
                  <span className="text-[11px] text-muted-foreground font-mono">
                    {c.taskCounts.done}/{c.taskCounts.total}
                  </span>
                </div>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
