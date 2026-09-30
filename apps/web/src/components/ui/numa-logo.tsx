import { cn } from '@/lib/utils';

export function NumaLogoIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn('h-6 w-6 shrink-0', className)}
    >
      <path
        d="M5 25V8l9 7V5l13 10v12L14 17v10L5 20"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function NumaLogo({
  className,
  size = 'default',
  showText = true,
}: {
  className?: string;
  size?: 'sm' | 'default' | 'lg';
  showText?: boolean;
}) {
  const iconSizes = {
    sm: 'h-5 w-5',
    default: 'h-6 w-6',
    lg: 'h-8 w-8',
  };

  const textSizes = {
    sm: 'text-base',
    default: 'text-lg',
    lg: 'text-2xl',
  };

  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 font-semibold tracking-tight text-foreground select-none',
        className,
      )}
    >
      <NumaLogoIcon className={iconSizes[size]} />
      {showText && (
        <span className={cn('font-semibold leading-none', textSizes[size])}>
          numa<span className="text-[#758a52] dark:text-[#dceda7]">.</span>
        </span>
      )}
    </div>
  );
}
