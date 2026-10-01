// Preferensi reduced-motion + pause animasi hero
import { useEffect, useState } from 'react';

export function useReducedMotion() {
  const [animationPaused, setAnimationPaused] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    return false;
  });

  useEffect(() => {
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleMotionChange = (e: MediaQueryListEvent) => {
      setAnimationPaused(e.matches);
    };
    motionPreference.addEventListener('change', handleMotionChange);

    const handleVisibilityChange = () => {
      const art = document.getElementById('hero-art');
      if (art) {
        art.classList.toggle('art-paused', document.hidden || animationPaused);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      motionPreference.removeEventListener('change', handleMotionChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [animationPaused]);

  return { animationPaused, setAnimationPaused };
}
