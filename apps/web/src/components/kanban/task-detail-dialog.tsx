import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  X,
  Copy,
  Check,
  FileCode,
  Terminal,
  CheckSquare,
  ListOrdered,
  AlertCircle,
  Ban,
  Layers,
  Link,
  BookOpen,
} from 'lucide-react';

export type UserStory = {
  id: string;
  persona: string;
  action: string;
  benefit: string;
  acceptanceCriteria?: string[];
  gherkin?: Array<{
    scenario: string;
    given: string;
    when: string;
    then: string;
  }>;
};

export type TaskDetail = {
  id: string;
  order?: number;
  title: string;
  description?: string;
  status: 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE' | 'BLOCKED';
  layer: string;
  acceptanceCriteria?: string[];
  blockedReason?: string | null;
  outputSummary?: string | null;
  aiContext?: {
    taskId?: string;
    userStoryId?: string;
    requirement_ids?: string[];
    depends_on?: string[];
    files_to_create?: string[];
    files_to_modify?: string[];
    files_readonly?: string[];
    forbidden?: string[];
    implementation_steps?: string[];
    validation_commands?: string[];
    definition_of_done?: string[];
    out_of_scope?: string[];
    consumesApis?: Array<{ method: string; path: string; description?: string }>;
  };
  dependsOn?: Array<{
    dependsOn: {
      id: string;
      title: string;
      status: string;
      order: number;
    };
  }>;
};

interface TaskDetailDialogProps {
  task: TaskDetail | null;
  isOpen: boolean;
  onClose: () => void;
  onStatusChange?: (taskId: string, newStatus: TaskDetail['status']) => void;
  userStories?: UserStory[];
}

export function TaskDetailDialog({ task, isOpen, onClose, userStories }: TaskDetailDialogProps) {
  const [copiedCmd, setCopiedCmd] = useState(false);

  if (!isOpen || !task) return null;

  const ctx = task.aiContext;
  const taskIdLabel = ctx?.taskId || (task.order ? `#${task.order}` : task.id.slice(0, 8));
  const parentStory = userStories?.find((s) => s.id === ctx?.userStoryId);

  const handleCopyCommands = () => {
    const cmds = ctx?.validation_commands ?? [];
    if (cmds.length === 0) return;
    navigator.clipboard.writeText(cmds.join('\n'));
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2000);
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto no-scrollbar">
      <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-3xl w-full p-6 space-y-5 my-8 text-foreground transition-all">
        {/* Header Dialog */}
        <div className="flex items-start justify-between gap-4 border-b border-border/80 pb-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded">
                {taskIdLabel}
              </span>
              <Badge variant="outline" className="text-xs font-semibold">
                <Layers className="h-3 w-3 mr-1" />
                {task.layer}
              </Badge>
              <Badge variant="outline" className="text-xs font-semibold bg-muted/50">
                {task.status}
              </Badge>
              {ctx?.userStoryId && (
                <Badge variant="outline" className="text-xs font-semibold bg-primary/10 text-primary border-primary/20">
                  <BookOpen className="h-3 w-3 mr-1" />
                  {ctx.userStoryId}
                </Badge>
              )}
            </div>
            <h2 className="text-lg font-bold leading-snug">{task.title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-lg hover:bg-muted shrink-0"
            aria-label="Tutup dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Konten Scrollable */}
        <div className="space-y-5 max-h-[60vh] overflow-y-auto no-scrollbar text-sm">
          {/* User Story */}
          {parentStory ? (
            <div className="space-y-1.5">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <BookOpen className="h-3.5 w-3.5" /> User Story ({parentStory.id})
              </h3>
              <div className="p-3 rounded-lg border border-border bg-muted/20 space-y-2">
                <p className="text-xs text-foreground/90 font-medium leading-relaxed">
                  Saya ingin {parentStory.action.replace(/^saya\s+ingin\s+/i, '')}, sehingga {parentStory.benefit.replace(/^sehingga\s+/i, '')}.
                </p>
                {parentStory.gherkin && parentStory.gherkin.length > 0 && (
                  <div className="pt-2 border-t border-border/60 space-y-1">
                    <span className="text-[11px] font-semibold text-muted-foreground block">Skenario Gherkin:</span>
                    <div className="bg-background/80 p-2.5 rounded text-[11px] font-mono space-y-0.5 border border-border/60">
                      {parentStory.gherkin[0].scenario && (
                        <div className="font-semibold text-primary">Skenario: {parentStory.gherkin[0].scenario}</div>
                      )}
                      <div className="text-muted-foreground">
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Given</span> {parentStory.gherkin[0].given}
                      </div>
                      <div className="text-muted-foreground">
                        <span className="text-blue-600 dark:text-blue-400 font-semibold">When</span> {parentStory.gherkin[0].when}
                      </div>
                      <div className="text-muted-foreground">
                        <span className="text-purple-600 dark:text-purple-400 font-semibold">Then</span> {parentStory.gherkin[0].then}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : ctx?.userStoryId ? (
            <div className="space-y-1.5">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <BookOpen className="h-3.5 w-3.5" /> User Story
              </h3>
              <div className="p-3 rounded-lg border border-border bg-muted/20 text-xs">
                <span className="font-mono font-bold text-primary">{ctx.userStoryId}</span>
              </div>
            </div>
          ) : null}

          {/* Deskripsi */}
          {task.description && (
            <div className="space-y-1.5">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Deskripsi
              </h3>
              <p className="text-sm text-foreground/90 bg-muted/20 p-3 rounded-lg border border-border/60 leading-relaxed">
                {task.description}
              </p>
            </div>
          )}

          {/* Prasyarat (Depends On) */}
          {task.dependsOn && task.dependsOn.length > 0 && (
            <div className="space-y-1.5">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Link className="h-3.5 w-3.5" /> Prasyarat (Depends On)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {task.dependsOn.map((dep) => (
                  <div
                    key={dep.dependsOn.id}
                    className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-muted/20 text-xs"
                  >
                    <span className="font-medium truncate mr-2">
                      #{dep.dependsOn.order} {dep.dependsOn.title}
                    </span>
                    <Badge
                      variant={dep.dependsOn.status === 'DONE' ? 'success' : 'outline'}
                      className="text-[10px] shrink-0"
                    >
                      {dep.dependsOn.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Acceptance Criteria (Fokus Utama) */}
          {task.acceptanceCriteria && task.acceptanceCriteria.length > 0 && (
            <div className="space-y-1.5">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <CheckSquare className="h-3.5 w-3.5 text-primary" /> Kriteria Penerimaan (Acceptance Criteria)
              </h3>
              <div className="p-3 rounded-lg border border-border bg-muted/20 space-y-2">
                {task.acceptanceCriteria.map((ac, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className="text-primary font-bold mt-0.5">-</span>
                    <span className="text-foreground/90">{ac}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Validation Commands (Fokus Utama) */}
          {ctx?.validation_commands && ctx.validation_commands.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Terminal className="h-3.5 w-3.5 text-primary" /> Perintah Verifikasi (Validation Commands)
                </h3>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleCopyCommands}
                  className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
                >
                  {copiedCmd ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                  <span>{copiedCmd ? 'Tersalin' : 'Salin Perintah'}</span>
                </Button>
              </div>
              <div className="p-3 rounded-lg bg-black text-emerald-400 font-mono text-xs overflow-x-auto border border-border space-y-1">
                {ctx.validation_commands.map((cmd, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-muted-foreground select-none">$</span>
                    <span>{cmd}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Implementation Steps */}
          {ctx?.implementation_steps && ctx.implementation_steps.length > 0 && (
            <div className="space-y-1.5">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <ListOrdered className="h-3.5 w-3.5" /> Langkah Implementasi
              </h3>
              <ol className="p-3 rounded-lg border border-border bg-muted/20 space-y-2 list-decimal list-inside text-xs text-foreground/90">
                {ctx.implementation_steps.map((step, i) => (
                  <li key={i} className="leading-relaxed">
                    <span>{step.replace(/^\d+[\.\)]\s*/, '')}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Panduan Struktur File (Rekomendasi Arsitektural - Hanya tampil jika ada file) */}
          {((ctx?.files_to_create?.length ?? 0) > 0 ||
            (ctx?.files_to_modify?.length ?? 0) > 0 ||
            (ctx?.files_readonly?.length ?? 0) > 0 ||
            (ctx?.forbidden?.length ?? 0) > 0) && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <FileCode className="h-3.5 w-3.5" /> Panduan Struktur File (Rekomendasi Arsitektur)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {/* Files to create */}
                {ctx?.files_to_create && ctx.files_to_create.length > 0 && (
                  <div className="p-3 rounded-lg border border-border bg-muted/10 space-y-1.5">
                    <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 block">
                      Rekomendasi File Dibuat:
                    </span>
                    <ul className="space-y-1 font-mono text-xs">
                      {ctx.files_to_create.map((f, i) => (
                        <li key={i} className="text-foreground/90 break-all">
                          + {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Files to modify */}
                {ctx?.files_to_modify && ctx.files_to_modify.length > 0 && (
                  <div className="p-3 rounded-lg border border-border bg-muted/10 space-y-1.5">
                    <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 block">
                      Rekomendasi File Dimodifikasi:
                    </span>
                    <ul className="space-y-1 font-mono text-xs">
                      {ctx.files_to_modify.map((f, i) => (
                        <li key={i} className="text-foreground/90 break-all">
                          ~ {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Readonly files */}
                {ctx?.files_readonly && ctx.files_readonly.length > 0 && (
                  <div className="p-3 rounded-lg border border-border bg-muted/10 space-y-1.5">
                    <span className="text-xs font-semibold text-muted-foreground block">
                      File Referensi (Read-Only):
                    </span>
                    <ul className="space-y-1 font-mono text-xs text-muted-foreground">
                      {ctx.files_readonly.map((f, i) => (
                        <li key={i} className="break-all">
                          * {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Forbidden files */}
                {ctx?.forbidden && ctx.forbidden.length > 0 && (
                  <div className="p-3 rounded-lg border border-destructive/30 bg-destructive/5 space-y-1.5">
                    <span className="text-xs font-semibold text-destructive flex items-center gap-1">
                      <Ban className="h-3 w-3" /> Dilarang Keras Disentuh:
                    </span>
                    <ul className="space-y-1 font-mono text-xs text-destructive/90">
                      {ctx.forbidden.map((f, i) => (
                        <li key={i} className="break-all">
                          x {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Failure Context / Blocked Reason */}
          {task.blockedReason && (
            <div className="p-3 rounded-lg border border-destructive/30 bg-destructive/10 space-y-1">
              <div className="text-xs font-semibold text-destructive flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5" /> Catatan Masalah / Blocked Reason:
              </div>
              <p className="text-xs text-destructive/90">{task.blockedReason}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border/80 pt-3 flex justify-end">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Tutup
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
