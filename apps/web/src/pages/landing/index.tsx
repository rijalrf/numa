import { useRef } from 'react';
import { useScrollReveal } from '@/hooks/use-scroll-reveal';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useMobileMenu } from '@/hooks/use-mobile-menu';
import { useWorkflowStages } from '@/hooks/use-workflow-stages';
import { useToast } from '@/hooks/use-toast';
import { SiteHeader } from './sections/site-header';
import { HeroSection } from './sections/hero-section';
import { WorkflowSection } from './sections/workflow-section';
import { KendaliSection } from './sections/kendali-section';
import { AgentTerminalSection } from './sections/agent-terminal-section';
import { PricingSection } from './sections/pricing-section';
import { FaqSection } from './sections/faq-section';
import { ClosingSection } from './sections/closing-section';
import { SiteFooter } from './sections/site-footer';
import './landing.css';

export function LandingPage() {
  useScrollReveal();
  const { animationPaused, setAnimationPaused } = useReducedMotion();
  const { isMobileMenuOpen, setIsMobileMenuOpen, closeMobileMenu, menuToggleRef } = useMobileMenu();
  const { selectedStage, selectStage, handleTabKeyDown } = useWorkflowStages();
  const { toastMessage, isToastShow, notify } = useToast();

  // --- Terminal Simulation ---
  const terminalRef = useRef<HTMLDivElement>(null);

  const replayTerminal = () => {
    if (terminalRef.current) {
      terminalRef.current.classList.remove('terminal-replay');
      void terminalRef.current.offsetWidth;
      terminalRef.current.classList.add('terminal-replay');
    }
  };

  const copyNumaNext = async () => {
    try {
      await navigator.clipboard.writeText('numa next');
      notify('Perintah numa next disalin.');
    } catch {
      notify('Salin perintah ini: numa next');
    }
  };

  // ponytail: alur popup draf ide diganti navigasi langsung ke /login.

  return (
    <div className="landing-root">
      <a href="#konten" className="skip-link">
        Lewati ke konten
      </a>

      <SiteHeader
        isMobileMenuOpen={isMobileMenuOpen}
        onToggleMobileMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        closeMobileMenu={closeMobileMenu}
        menuToggleRef={menuToggleRef}
      />

      <main id="konten">
        <HeroSection
          animationPaused={animationPaused}
          onToggleMotion={() => setAnimationPaused(!animationPaused)}
          onSelectStage={selectStage}
        />
        <WorkflowSection
          selectedStage={selectedStage}
          onSelectStage={selectStage}
          onTabKeyDown={handleTabKeyDown}
        />
        <KendaliSection />
        <AgentTerminalSection
          terminalRef={terminalRef}
          onReplayTerminal={replayTerminal}
          onCopyCommand={copyNumaNext}
        />
        <PricingSection />
        <FaqSection />
        <ClosingSection />
      </main>

      <SiteFooter />

      {/* TOAST */}
      <div id="toast" className={`toast ${isToastShow ? 'show' : ''}`} role="status" aria-live="polite">
        {toastMessage}
      </div>
    </div>
  );
}
