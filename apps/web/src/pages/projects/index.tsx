// Halaman daftar project (untuk user menu)
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/http';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, ArrowRight } from 'lucide-react';
import { STAGE_LABELS } from '@/lib/constants';

type Project = {
  id: string;
  name: string;
  idea: string;
  status: string;
  wizardStep?: string;
  updatedAt: string;
};

function getProjectStageUrl(p: Project): string {
  const step = p.wizardStep || 'techstack';
  if (step === 'done') return `/projects/${p.id}/board`;
  if (step === 'chat' || step === 'interview') return `/projects/${p.id}/techstack`;
  return `/projects/${p.id}/${step}`;
}

export function ProjectsPage() {
  const navigate = useNavigate();
  const projectsQ = useQuery({
    queryKey: ['projects'],
    queryFn: () => api<{ projects: Project[] }>('/api/projects'),
  });

  return (
    <div className="max-w-6xl mx-auto w-full space-y-6 pb-12">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Kartu Buat Proyek Baru */}
        <Card
          className="hover:shadow-md transition-all cursor-pointer flex flex-col justify-between border-dashed border-2 hover:border-primary/60 bg-muted/20 hover:bg-accent/30 group min-h-[160px]"
          onClick={() => navigate('/chat')}
        >
          <CardHeader>
            <div className="flex items-center gap-2 text-foreground font-semibold text-base group-hover:text-primary transition-colors">
              <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors shrink-0">
                <Plus className="h-4 w-4" />
              </div>
              <CardTitle className="text-base leading-snug">Buat Proyek Baru</CardTitle>
            </div>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Mulai perancangan aplikasi baru dari ide mentah bersama AI.
            </p>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex items-center justify-end text-xs text-muted-foreground border-t border-border/60 pt-3">
              <span className="flex items-center gap-1 text-primary font-medium group-hover:underline text-[11px]">
                Mulai Sekarang <ArrowRight className="h-3 w-3" />
              </span>
            </div>
          </CardContent>
        </Card>

        {projectsQ.isLoading && (
          <Card className="col-span-1 md:col-span-2 text-center py-8 text-muted-foreground">
            Memuat daftar proyek...
          </Card>
        )}

        {projectsQ.data?.projects.map((p) => (
          <Card
            key={p.id}
            className="hover:shadow-md transition-shadow cursor-pointer flex flex-col justify-between"
            onClick={() => navigate(getProjectStageUrl(p))}
          >
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-base leading-snug">{p.name}</CardTitle>
                <Badge variant="outline" className="text-[10px] shrink-0 font-medium">
                  {STAGE_LABELS[p.wizardStep || 'interview'] || p.wizardStep}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{p.idea}</p>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex items-center justify-end text-xs text-muted-foreground border-t pt-3">
                <span className="flex items-center gap-1 text-primary font-medium hover:underline text-[11px]">
                  Buka Tahap Terakhir <ArrowRight className="h-3 w-3" />
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
