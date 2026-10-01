import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type Props = {
  icon: ReactNode;
  title: string;
  description: string;
  badge?: { text: string; className: string };
  isSelected: boolean;
  onClick: () => void;
};

export function ModeCard({ icon, title, description, badge, isSelected, onClick }: Props) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'group relative rounded-md border-2 p-5 flex flex-col justify-between cursor-pointer transition-all duration-200 select-none shadow-xs',
        isSelected
          ? 'border-primary bg-primary/5 dark:bg-primary/10 ring-2 ring-primary/30 shadow-md'
          : 'border-border bg-card hover:border-primary/50 hover:bg-accent/40'
      )}
    >
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div
            className={cn(
              'h-10 w-10 rounded-md flex items-center justify-center transition-colors',
              isSelected ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-primary/10 text-primary group-hover:bg-primary/20'
            )}
          >
            {icon}
          </div>
          <div
            className={cn(
              'h-5 w-5 rounded-md flex items-center justify-center border transition-all',
              isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40 bg-background'
            )}
          >
            {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            {badge && (
              <Badge variant="outline" className={cn('text-[9px] font-medium px-1.5 py-0', badge.className)}>
                {badge.text}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
        </div>
      </div>

      <div className="pt-4">
        <span
          className={cn(
            'text-xs font-medium block text-center py-1.5 rounded-md transition-colors',
            isSelected ? 'text-primary font-semibold' : 'text-muted-foreground'
          )}
        >
          {isSelected ? 'Pilihan Terpilih' : 'Klik untuk memilih'}
        </span>
      </div>
    </div>
  );
}