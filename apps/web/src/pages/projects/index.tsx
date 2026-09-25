// Halaman daftar project (untuk user menu)
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/http';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button onClick={() => navigate('/chat')} className="gap-1.5">
          <Plus className="h-4 w-4" /> Buat Proyek Baru
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {projectsQ.isLoading && (
          <Card className="col-span-full text-center py-8 text-muted-foreground">
            Memuat...
          </Card>
        )}
        {projectsQ.data?.projects.length === 0 && !projectsQ.isLoading && (
          <Card className="col-span-full text-center py-8 text-muted-foreground">
            Belum ada project. Klik "Buat Project Baru" untuk mulai.
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
