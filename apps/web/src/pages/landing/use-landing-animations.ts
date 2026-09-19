import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

/**
 * Hook GSAP untuk semua animasi landing page.
 * Cleanup otomatis via gsap.context().revert() saat unmount.
 */
export function useLandingAnimations() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      // Hero text reveal
      document.querySelectorAll('[data-page="landing"] .reveal-line').forEach((el, i) => {
        const child = el.children[0];
        if (child) {
          gsap.to(child, {
            y: 0,
            duration: 0.9,
            ease: 'power3.out',
            delay: 0.2 + i * 0.12,
          });
        }
      });

      // Hero CTA + viz + scroll hint fade in
      gsap.to('#heroCta', { opacity: 1, duration: 0.8, delay: 1.0, ease: 'power2.out' });
      gsap.to('#heroViz', { opacity: 1, duration: 1.2, delay: 0.6, ease: 'power2.out' });
      gsap.to('#scrollHint', { opacity: 1, duration: 0.6, delay: 1.4, ease: 'power2.out' });

      // Pipeline section fades
      gsap.utils.toArray<Element>('.pipeline-fade').forEach((el, i) => {
        gsap.from(el, {
          scrollTrigger: { trigger: el, start: 'top 85%', once: true },
          y: 20, opacity: 0, duration: 0.7, delay: i * 0.1, ease: 'power2.out',
        });
      });

      // Stagger grid cards
      gsap.utils.toArray<Element>('#pipelineGrid > *').forEach((card, i) => {
        gsap.to(card, {
          scrollTrigger: { trigger: card, start: 'top 88%', once: true },
          y: 0, opacity: 1, duration: 0.7, delay: i * 0.1, ease: 'power2.out',
        });
      });

      // Terminal typing effect
      const termLines = document.querySelectorAll('.terminal-line');
      termLines.forEach(line => { (line as HTMLElement).style.opacity = '0'; });
      ScrollTrigger.create({
        trigger: '#terminalBody',
        start: 'top 80%',
        once: true,
        onEnter: () => {
          termLines.forEach(line => {
            const delay = parseFloat((line as HTMLElement).dataset.delay || '0');
            gsap.to(line, { opacity: 1, duration: 0.15, delay, ease: 'none' });
          });
        },
      });

      // Pricing cards
      gsap.utils.toArray<Element>('.pricing-card').forEach((card, i) => {
        gsap.from(card, {
          scrollTrigger: { trigger: card, start: 'top 85%', once: true },
          y: 30, opacity: 0, duration: 0.7, delay: i * 0.12, ease: 'power2.out',
        });
      });

      // CTA section
      gsap.utils.toArray<Element>('.cta-fade').forEach((el, i) => {
        gsap.from(el, {
          scrollTrigger: { trigger: el, start: 'top 85%', once: true },
          y: 20, opacity: 0, duration: 0.8, delay: i * 0.15, ease: 'power2.out',
        });
      });
    }, containerRef);

    return () => ctx.revert();
  }, []);

  return containerRef;
}
