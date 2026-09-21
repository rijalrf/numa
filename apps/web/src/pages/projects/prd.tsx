// PRD page: View atau auto-generate PRD dari chat history + tech stack
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '@/lib/http';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Lock } from 'lucide-react';
import { isStageLocked } from '@/lib/constants';
import { useWizardNav } from '@/components/layout/wizard-nav';

export type PrdContent = {
  overview?: string;
  goals?: string[];
  features?: Array<{ id?: string; name: string; description?: string }>;
  userStories?: Array<{
    id: string;
    persona: string;
    action: string;
    benefit: string;
    acceptanceCriteria?: string[];
    gherkin?: Array<{
      title?: string;
      given: string;
      when: string;
      then: string;
    }>;
  }>;
  functionalRequirements?: Array<{
    id: string;
    title: string;
    description: string;
    priority?: 'MUST' | 'SHOULD' | 'COULD';
    actor?: string;
  }>;
  productRules?: Array<{
    id: string;
    description: string;
  }>;
  businessRules?: Array<{
    id: string;
    description: string;
  }>;
  edgeCases?: Array<{
    id: string;
    scenario: string;
    expectedBehavior: string;
  }>;
  successMetrics?: Array<{
    metric: string;
    target: string;
  }>;
  techRequirements?: string[];
  nonFunctional?: string[];
  outOfScope?: string[];
};

export function PrdPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [prd, setPrd] = useState<PrdContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [isLocked, setIsLocked] = useState(false);

  // Load PRD on mount
  useEffect(() => {
    if (!projectId) return;

    const loadPrd = async () => {
      try {
        const projectRes = await api<{ project?: { wizardStep?: string } }>(`/api/projects/${projectId}`);
        const currentStep = projectRes.project?.wizardStep || 'prd';
        const locked = isStageLocked(currentStep, 'prd');
        setIsLocked(locked);

        const json = await api<{ prd?: { content: unknown }; brd?: { content: unknown } }>(`/api/projects/${projectId}/prd`);
        const rawContent = json.prd?.content ?? json.brd?.content;
        if (rawContent) {
          setPrd(rawContent as PrdContent);
        } else if (!locked) {
          // Auto generate jika belum ada dan belum terkunci
          await generatePRD();
        }
      } catch (err) {
        console.error('Gagal load PRD:', err);
      } finally {
        setLoading(false);
      }
    };

    loadPrd();
  }, [projectId]);

  const generatePRD = async () => {
    if (!projectId || isLocked) return;
    setGenerating(true);

    try {
      await api(`/api/projects/${projectId}/prd/generate`, {
        method: 'POST',
      });
      const refreshJson = await api<{ prd?: { content: unknown }; brd?: { content: unknown } }>(`/api/projects/${projectId}/prd`);
      const rawContent = refreshJson.prd?.content ?? refreshJson.brd?.content;
      setPrd(rawContent as PrdContent);
    } catch (err) {
      console.error('Error generating PRD:', err);
    } finally {
      setGenerating(false);
      setLoading(false);
    }
  };

  const handleBackToTechStack = async () => {
    if (!projectId) return;
    try {
      await api(`/api/projects/${projectId}/wizard-step`, {
        method: 'POST',
        body: JSON.stringify({ step: 'techstack' }),
      });
      navigate(`/projects/${projectId}/techstack`);
    } catch {
      navigate(`/projects/${projectId}/techstack`);
    }
  };

  useWizardNav({
    back: {
      label: 'Kembali ke Tech Stack',
      onClick: handleBackToTechStack,
    },
    next: {
      label: 'Lihat Struktur Fitur',
      onClick: () => navigate(`/projects/${projectId}/tree`),
      disabled: !prd || generating,
    },
  });

  if (loading || generating) {
    return (
      <div className="max-w-4xl mx-auto w-full space-y-6">
        {/* Skeleton dokumen */}
        <Card>
          <CardHeader>
            <div className="h-6 bg-muted w-2/3 rounded animate-pulse" />
          </CardHeader>
          <CardContent className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i}>
                <div className="h-4 bg-muted w-1/4 rounded mb-2 animate-pulse" />
                <div className="h-4 bg-muted w-full rounded animate-pulse" />
                <div className="h-4 bg-muted w-5/6 rounded animate-pulse mt-2" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  const productRulesList = prd?.productRules?.length ? prd.productRules : prd?.businessRules;

  return (
    <div className="max-w-4xl mx-auto w-full space-y-6">
      {/* Banner terkunci jika sudah lewat PRD */}
      {isLocked && (
        <div className="flex items-center gap-2.5 p-3.5 bg-muted/70 border border-border rounded-xl text-xs text-muted-foreground shadow-xs">
          <Lock className="h-4 w-4 text-primary shrink-0" />
          <span>
            Tahap Dokumen PRD telah selesai dan terkunci (Read-Only). Spesifikasi kebutuhan fungsional dan aturan produk tersimpan permanen.
          </span>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-border">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Dokumen Kebutuhan Produk (PRD)</h2>
          <p className="text-xs text-muted-foreground">
            Spesifikasi kebutuhan produk, user stories (format Gherkin), functional requirements, dan aturan produk.
          </p>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
          {!prd && !generating && !isLocked && (
            <Button onClick={generatePRD} size="sm" variant="outline" className="gap-2">
              Generate PRD
            </Button>
          )}
        </div>
      </div>

      {/* PRD Content */}
      <div className="space-y-6 pb-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Ringkasan Produk</CardTitle>
          </CardHeader>
          <CardContent>
            {prd?.overview ? (
              <p className="whitespace-pre-wrap">{prd.overview}</p>
            ) : (
              <p className="text-muted-foreground italic">Belum ada ringkasan.</p>
            )}
          </CardContent>
        </Card>

        {/* Goals */}
        {prd?.goals && prd.goals.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Tujuan Produk (Goals)</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc list-inside space-y-1">
                {prd.goals.map((g, i) => (
                  <li key={i}>{g}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Features */}
        {prd?.features && prd.features.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Fitur Utama</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {prd.features.map((f, i) => (
                  <div
                    key={i}
                    className="p-3.5 rounded-xl border border-border bg-card/60 space-y-1.5 hover:border-primary/40 transition-colors"
                  >
                    <div className="text-sm font-semibold text-foreground leading-snug">
                      {f.name}
                    </div>
                    {f.description && (
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {f.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* User Stories (US-xxx) dengan Format Gherkin */}
        {prd?.userStories && prd.userStories.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center justify-between">
                <span>User Stories</span>
                <span className="text-xs font-normal text-muted-foreground font-mono">Format Gherkin (Given/When/Then)</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {prd.userStories.map((s) => (
                  <div key={s.id} className="p-3.5 rounded-lg border border-border bg-card/60 flex flex-col gap-2 shadow-2xs">
                    <div className="flex items-center gap-2">
                      <Badge variant="default" className="font-mono text-xs">
                        {s.id}
                      </Badge>
                      <span className="font-semibold text-xs text-primary">{s.persona}</span>
                    </div>
                    <p className="text-xs text-foreground font-medium leading-relaxed">
                      {s.action}, <span className="text-muted-foreground font-normal">{s.benefit}</span>
                    </p>
                    {s.acceptanceCriteria && s.acceptanceCriteria.length > 0 && (
                      <div className="pt-1">
                        <span className="text-[11px] font-semibold text-muted-foreground block mb-0.5">Kriteria Penerimaan:</span>
                        <ul className="list-disc list-inside text-[11px] text-muted-foreground space-y-0.5">
                          {s.acceptanceCriteria.map((ac, idx) => (
                            <li key={idx}>{ac}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Skenario Gherkin Terstruktur */}
                    {s.gherkin && s.gherkin.length > 0 && (
                      <div className="mt-2 space-y-2 border-t border-border/60 pt-2.5">
                        <span className="text-[11px] font-semibold text-foreground uppercase tracking-wider block">
                          Skenario Gherkin:
                        </span>
                        <div className="space-y-2">
                          {s.gherkin.map((g, gIdx) => (
                            <div key={gIdx} className="bg-muted/30 rounded-md p-2.5 text-xs border border-border/60 space-y-1 font-mono">
                              {g.title && (
                                <div className="font-sans font-semibold text-primary text-[11px] mb-1">
                                  {g.title}
                                </div>
                              )}
                              <div className="text-[11px]">
                                <span className="text-emerald-600 dark:text-emerald-400 font-bold">Given</span>{' '}
                                <span className="text-foreground/90">{g.given}</span>
                              </div>
                              <div className="text-[11px]">
                                <span className="text-amber-600 dark:text-amber-400 font-bold">When</span>{' '}
                                <span className="text-foreground/90">{g.when}</span>
                              </div>
                              <div className="text-[11px]">
                                <span className="text-blue-600 dark:text-blue-400 font-bold">Then</span>{' '}
                                <span className="text-foreground/90">{g.then}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Functional Requirements (FR-xxx) */}
        {prd?.functionalRequirements && prd.functionalRequirements.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Kebutuhan Fungsional (Source of Truth)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {prd.functionalRequirements.map((r) => (
                  <div key={r.id} className="p-3 rounded-md border border-border bg-card/50 flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <Badge variant="default" className="font-mono text-xs">
                        {r.id}
                      </Badge>
                      <span className="font-semibold text-sm">{r.title}</span>
                      {r.priority && (
                        <Badge variant="outline" className="ml-auto text-[10px]">
                          {r.priority}
                        </Badge>
                      )}
                      {r.actor && (
                        <Badge variant="outline" className="text-[10px]">
                          {r.actor}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{r.description}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Product Rules (PR-xxx / BR-xxx) */}
        {productRulesList && productRulesList.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Aturan Produk (Product Rules)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {productRulesList.map((b) => (
                  <div key={b.id} className="flex items-start gap-2.5 p-2.5 rounded-md border border-border/70 text-xs">
                    <Badge variant="outline" className="font-mono shrink-0">
                      {b.id}
                    </Badge>
                    <span className="pt-0.5">{b.description}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Edge Cases & Failure States (EC-xxx) */}
        {prd?.edgeCases && prd.edgeCases.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Edge Cases &amp; Skenario Kegagalan</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {prd.edgeCases.map((ec) => (
                  <div key={ec.id} className="p-2.5 rounded-md border border-border/70 text-xs space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono shrink-0">
                        {ec.id}
                      </Badge>
                      <span className="font-medium text-foreground">{ec.scenario}</span>
                    </div>
                    <p className="text-muted-foreground pl-1 text-[11px]">
                      Ekspektasi: {ec.expectedBehavior}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Success Metrics */}
        {prd?.successMetrics && prd.successMetrics.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Metrik Keberhasilan Produk (Success Metrics)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {prd.successMetrics.map((sm, idx) => (
                  <div key={idx} className="p-2.5 rounded-md border border-border/70 bg-card/40 text-xs">
                    <div className="font-semibold text-foreground">{sm.metric}</div>
                    <div className="text-muted-foreground text-[11px] mt-0.5">{sm.target}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tech Requirements */}
        {prd?.techRequirements && prd.techRequirements.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Tech Requirements</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc list-inside space-y-1">
                {prd.techRequirements.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Non-Functional */}
        {prd?.nonFunctional && prd.nonFunctional.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Non-Functional Requirements</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc list-inside space-y-1">
                {prd.nonFunctional.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Out of Scope */}
        {prd?.outOfScope && prd.outOfScope.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Out of Scope</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc list-inside space-y-1">
                {prd.outOfScope.map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
