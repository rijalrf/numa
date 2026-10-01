// Pemilihan tahap workflow + navigasi keyboard tab
import { useState } from 'react';
import { STAGE_COUNT } from '@/pages/landing/sections/stage-data';

export function useWorkflowStages() {
  const [selectedStage, setSelectedStage] = useState(0);

  const selectStage = (index: number, focus = false) => {
    const next = (index + STAGE_COUNT) % STAGE_COUNT;
    setSelectedStage(next);
    if (focus) {
      document.getElementById(`step-${next}`)?.focus();
    }
  };

  const handleTabKeyDown = (e: React.KeyboardEvent, index: number) => {
    const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    if (e.key === 'Home') selectStage(0, true);
    else if (e.key === 'End') selectStage(STAGE_COUNT - 1, true);
    else if (['ArrowRight', 'ArrowDown'].includes(e.key)) selectStage(index + 1, true);
    else if (['ArrowLeft', 'ArrowUp'].includes(e.key)) selectStage(index - 1, true);
  };

  return { selectedStage, selectStage, handleTabKeyDown };
}
