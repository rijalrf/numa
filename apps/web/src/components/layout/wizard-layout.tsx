// WizardLayout: Header + WizardNav (sticky top) + content
import { Outlet, useLocation } from 'react-router-dom';
import { Header } from './header';
import { WizardNavProvider, WizardNav } from './wizard-nav';
import { cn } from '@/lib/utils';

export default function WizardLayout() {
  const location = useLocation();
  const isChat = location.pathname.startsWith('/chat/');
  const isHome = location.pathname === '/chat';
  const isTree = location.pathname.includes('/tree');

  return (
    <WizardNavProvider>
      <div className={cn('bg-background flex flex-col', isTree ? 'h-screen overflow-hidden' : 'min-h-screen')}>
        <div className="sticky top-0 z-30 shrink-0">
          <Header />
          <WizardNav />
        </div>
        <main className={cn('flex-1', isChat || isHome ? 'flex flex-col' : isTree ? 'flex flex-col min-h-0 overflow-hidden' : 'px-6 py-6')}>
          <Outlet />
        </main>
      </div>
    </WizardNavProvider>
  );
}
