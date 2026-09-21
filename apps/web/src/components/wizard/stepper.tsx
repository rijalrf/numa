// Stepper indikator langkah wizard (Chat → Tech Stack → PRD → Struktur → Board)
import { useLocation } from 'react-router-dom';
import { Check, Circle } from 'lucide-react';

const STEPS = [
  { id: 'chat', label: 'Chat', match: (p: string) => p.startsWith('/chat') },
  { id: 'techstack', label: 'Tech Stack', match: (p: string) => p.includes('/techstack') },
  { id: 'prd', label: 'PRD', match: (p: string) => p.includes('/prd') || p.includes('/brd') },
  { id: 'tree', label: 'Struktur', match: (p: string) => p.includes('/tree') },
  { id: 'board', label: 'Board', match: (p: string) => p.includes('/board') },
];

export function Stepper() {
  const location = useLocation();

  // Tentukan current step berdasarkan pathname
  let currentStepIndex = -1;
  for (let i = 0; i < STEPS.length; i++) {
    const step = STEPS[i];
    if (step.match(location.pathname)) {
      currentStepIndex = i;
      break;
    }
  }

  return (
    <div className="border-b bg-background">
      <div className="px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          {STEPS.map((step, idx) => {
            const isActive = idx === currentStepIndex;
            const isCompleted = idx < currentStepIndex;

            return (
              <div key={step.id} className="flex items-center flex-1">
                <div className="flex items-center gap-2">
                  {isCompleted ? (
                    <Check className="h-5 w-5 text-primary" />
                  ) : isActive ? (
                    <Circle className="h-5 w-5 text-primary fill-current opacity-20" />
                  ) : (
                    <Circle className="h-5 w-5 text-muted-foreground opacity-30" />
                  )}
                  <span
                    className={`text-sm font-medium ${
                      isActive || isCompleted
                        ? 'text-foreground'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
                {idx < STEPS.length - 1 && (
                  <div className="flex-1 h-px mx-4 bg-border" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
