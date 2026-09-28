import { useEffect, useRef, useCallback } from 'react';
import { LandingHeader } from './landing-header';
import { HeroSection } from './hero-section';
import { TickerSection } from './ticker-section';
import { FeaturesSection } from './features-section';
import { TerminalSection } from './terminal-section';
import { PricingSection } from './pricing-section';
import { CtaSection } from './cta-section';
import { LandingFooter } from './landing-footer';
import { useLandingAnimations } from './use-landing-animations';
import './landing.css';

export function LandingPage() {
  const containerRef = useLandingAnimations();
  const glowRef = useRef<HTMLDivElement>(null);
  const mousePos = useRef({ x: -500, y: -500 });

  const handleMouseMove = useCallback((e: MouseEvent) => {
    mousePos.current = { x: e.clientX, y: e.clientY };
  }, []);

  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove);

    let rafId: number;
    function updateGlow() {
      if (glowRef.current) {
        glowRef.current.style.left = mousePos.current.x + 'px';
        glowRef.current.style.top = mousePos.current.y + 'px';
      }
      rafId = requestAnimationFrame(updateGlow);
    }
    updateGlow();

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(rafId);
    };
  }, [handleMouseMove]);

  return (
    <div
      ref={containerRef}
      data-page="landing"
      className="noise-overlay bg-background font-sans text-foreground antialiased dark:bg-black dark:text-white"
      style={{ scrollBehavior: 'smooth' }}
    >
      <div ref={glowRef} className="cursor-glow" />
      <LandingHeader />
      <HeroSection />
      <TickerSection />
      <FeaturesSection />
      <TerminalSection />
      <PricingSection />
      <CtaSection />
      <LandingFooter />
    </div>
  );
}
