// WizardLayout: Header + WizardNav (sticky top) + content
import { Outlet } from 'react-router-dom';
import { Header } from './header';
import { WizardNavProvider, WizardNav } from './wizard-nav';
import { useLocation } from 'react-router-dom';

export default function WizardLayout() {
  const location = useLocation();
  const isChat = location.pathname.startsWith('/chat/');
  const isHome = location.pathname === '/dashboard';

  return (
    <WizardNavProvider>
      <div className="min-h-screen bg-background flex flex-col">
        <div className="sticky top-0 z-50">
          <Header />
          <WizardNav />
        </div>
        <main className={isChat || isHome ? 'flex-1' : 'px-6 py-6 flex-1'}>
          <Outlet />
        </main>
      </div>
    </WizardNavProvider>
  );
}
