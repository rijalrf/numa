import { Check } from 'lucide-react';

type Props = {
  items: string[];
};

export function SelectedTechsList({ items }: Props) {
  if (items.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic py-2">
        Tidak ada data teknologi tersimpan.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span
          key={item}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary/10 text-primary border border-primary/30 text-xs font-medium"
        >
          <Check className="h-3 w-3" />
          <span>{item}</span>
        </span>
      ))}
    </div>
  );
}
