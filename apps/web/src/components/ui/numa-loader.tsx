import { cn } from '@/lib/utils';

interface NumaLoaderProps {
  label?: string;
  sublabel?: string;
  className?: string;
}

export function NumaLoader({ label, sublabel, className }: NumaLoaderProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-4 text-center select-none', className)}>
      <style>{`
        @keyframes numa-draw {
          0% { stroke-dashoffset: 82; }
          50% { stroke-dashoffset: 0; }
          100% { stroke-dashoffset: -82; }
        }
        @keyframes numa-blink {
          0%, 40% { opacity: 0; }
          50%, 70% { opacity: 1; }
          80%, 100% { opacity: 0; }
        }
      `}</style>

      <svg
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden="true"
        className="h-12 w-12 shrink-0"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="32" height="32" rx="7" fill="#193c34" />
        <path
          d="M5 25V8l9 7V5l13 10v12L14 17v10L5 20"
          stroke="#dceda7"
          strokeWidth="3"
          strokeLinejoin="round"
          fill="none"
          style={{
            strokeDasharray: 82,
            strokeDashoffset: 82,
            animation: 'numa-draw 1.8s ease-in-out infinite',
          }}
        />
        <circle
          cx="27"
          cy="25"
          r="2"
          fill="#dceda7"
          style={{
            opacity: 0,
            animation: 'numa-blink 1.8s ease-in-out infinite',
          }}
        />
      </svg>

      <div className="flex flex-col items-center gap-1">
        <span className="font-semibold text-xs tracking-tight text-foreground">
          numa<span className="text-[#758a52] dark:text-[#dceda7]">.</span>
        </span>
        {label && <p className="text-sm font-medium text-foreground">{label}</p>}
        {sublabel && <p className="text-xs text-muted-foreground max-w-sm">{sublabel}</p>}
      </div>
    </div>
  );
}
