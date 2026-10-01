import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

type AlertBannerVariant = 'destructive' | 'success' | 'info';

const rootVariants: Record<AlertBannerVariant, string> = {
  destructive: 'border-destructive/30 bg-destructive/10 text-destructive',
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  info: 'border-border/80 bg-muted/40 text-muted-foreground',
};

const dismissVariants: Record<AlertBannerVariant, string> = {
  destructive: 'p-1 hover:bg-destructive/20 rounded text-destructive shrink-0 cursor-pointer',
  success: 'text-muted-foreground hover:text-foreground p-0.5 rounded-md transition-colors',
  info: 'text-muted-foreground hover:text-foreground p-0.5 rounded-md transition-colors',
};

type AlertBannerProps = {
  variant: AlertBannerVariant;
  children: ReactNode;
  /** Konten sisi kanan (mis. tombol aksi) */
  actions?: ReactNode;
  /** Jika diisi, tombol tutup (X) dirender di sisi kanan */
  onDismiss?: () => void;
  dismissLabel?: string;
  className?: string;
};

export function AlertBanner({
  variant,
  children,
  actions,
  onDismiss,
  dismissLabel,
  className,
}: AlertBannerProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between rounded-md border text-xs',
        rootVariants[variant],
        className
      )}
    >
      {children}
      {actions}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className={dismissVariants[variant]}
          aria-label={dismissLabel}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
