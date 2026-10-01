import { Check, Database } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GOLDEN_PACKS } from '@/pages/projects/techstack';

type Props = {
  selectedPackId: string;
  selectedDbByPack: Record<string, string>;
  onSelectPack: (packId: string) => void;
  onSelectDb: (packId: string, dbId: string) => void;
};

export function GoldenPackList({ selectedPackId, selectedDbByPack, onSelectPack, onSelectDb }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {GOLDEN_PACKS.map((pack) => {
        const isSelected = selectedPackId === pack.id;
        const currentDb = selectedDbByPack[pack.id] || pack.dbOptions[0].id;

        return (
          <div
            key={pack.id}
            onClick={() => onSelectPack(pack.id)}
            className={cn(
              'p-4 rounded-md border cursor-pointer transition-all space-y-3 flex flex-col justify-between',
              isSelected
                ? 'border-primary bg-primary/5 ring-1 ring-primary'
                : 'border-border bg-card hover:border-primary/40'
            )}
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">
                  {pack.title}
                </span>
                <div
                  className={cn(
                    'h-4 w-4 rounded-md flex items-center justify-center border text-[10px]',
                    isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40'
                  )}
                >
                  {isSelected && <Check className="h-2.5 w-2.5 stroke-[3]" />}
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground leading-snug">
                {pack.description}
              </p>
              <div className="flex flex-wrap gap-1 pt-1">
                {pack.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] px-2 py-0.5 rounded-md bg-muted text-foreground/80 font-mono"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            {/* Pilihan Database per Pack */}
            <div
              className="pt-3 border-t border-border/70 space-y-1.5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
                <Database className="h-3 w-3 text-primary" />
                <span>Database:</span>
              </div>
              <div className="grid grid-cols-1 gap-1">
                {pack.dbOptions.map((db) => {
                  const isDbSelected = currentDb === db.id;
                  return (
                    <label
                      key={db.id}
                      className={cn(
                        'flex items-center gap-2 p-1.5 rounded-md text-[11px] cursor-pointer transition-colors border',
                        isDbSelected
                          ? 'bg-primary/10 border-primary/40 text-primary font-medium'
                          : 'hover:bg-muted/60 border-transparent text-muted-foreground'
                      )}
                      onClick={() => onSelectDb(pack.id, db.id)}
                    >
                      <input
                        type="radio"
                        name={`db-${pack.id}`}
                        checked={isDbSelected}
                        onChange={() => onSelectDb(pack.id, db.id)}
                        className="h-3 w-3 text-primary focus:ring-primary border-border"
                      />
                      <span>{db.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
