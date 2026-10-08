// Kartu rekomendasi AI di halaman tech stack: status penyiapan, hasil, dan alasan untuk dikonfirmasi user.
import { Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { SelectedTechsList } from '@/components/wizard/selected-techs-list';

export type RecommendationStatus = 'loading' | 'generating' | 'ready' | 'failed';

type Props = {
  status: RecommendationStatus;
  /** Nama paket hasil rekomendasi, mis. "Next.js Fullstack". */
  packTitle?: string;
  techStack: string[];
  reasoning: string;
  onRetry: () => void;
};

export function AiRecommendationCard({ status, packTitle, techStack, reasoning, onRetry }: Props) {
  return (
    <Card className="border-primary/30 shadow-xs">
      <CardHeader className="pb-3 border-b bg-muted/20">
        <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span>Rekomendasi Numa{packTitle ? `: ${packTitle}` : ''}</span>
        </CardTitle>
        <CardDescription className="text-xs text-muted-foreground">
          Dipilih dari ringkasan hasil survey kebutuhan Anda. Periksa dulu sebelum melanjutkan.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        {(status === 'loading' || status === 'generating') && (
          <div className="flex items-center gap-2.5 text-xs text-muted-foreground py-2">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span>Numa sedang mencocokkan kebutuhan proyek dengan teknologi yang paling sesuai...</span>
          </div>
        )}

        {status === 'ready' && (
          <>
            <SelectedTechsList items={techStack} />
            {reasoning && <p className="text-sm text-foreground leading-relaxed">{reasoning}</p>}
            <Button type="button" variant="outline" size="sm" className="gap-2" onClick={onRetry}>
              <RefreshCw className="h-3.5 w-3.5" />
              Minta rekomendasi ulang
            </Button>
          </>
        )}

        {status === 'failed' && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Rekomendasi belum berhasil dibuat. Coba lagi, atau pilih Golden Stack secara manual.
            </p>
            <Button type="button" variant="outline" size="sm" className="gap-2" onClick={onRetry}>
              <RefreshCw className="h-3.5 w-3.5" />
              Coba lagi
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
