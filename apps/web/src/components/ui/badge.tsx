import { cn } from '@/lib/utils';
import * as React from 'react';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'outline' | 'success' | 'warning';
}

export function Badge({ className, variant = 'default', ...rest }: BadgeProps) {
  const variantClasses = {
    default: 'bg-primary text-primary-foreground hover:bg-primary/80',
    outline: 'border border-input bg-transparent hover:bg-accent',
    success: 'bg-primary/15 text-primary dark:bg-primary/20 dark:text-primary',
    warning: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-semibold transition-colors',
        variantClasses[variant],
        className
      )}
      {...rest}
    />
  );
}
