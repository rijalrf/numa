import { Routes, Route, Navigate } from 'react-router-dom';
import { useSession } from '@/lib/auth-client';
import { LoginPage } from '@/pages/login';
import { LandingPage } from '@/pages/landing';
import { ProfilePage } from '@/pages/profile';
import { ProjectsPage } from '@/pages/projects/index';
import { ChatPage } from '@/pages/chat';
import { TechStackPage } from '@/pages/projects/techstack';
import { PrdPage } from '@/pages/projects/prd';
import { TreePage } from '@/pages/projects/tree';
import { BoardPage } from '@/pages/projects/board';
import { SettingsPage } from '@/pages/projects/settings';
import { BillingPage } from '@/pages/settings/billing';
import WizardLayout from '@/components/layout/wizard-layout';

function Protected({ children }: { children: React.ReactNode }) {
  const { data, isPending } = useSession();
  if (isPending) return <div className="p-8 text-muted-foreground">Memuat...</div>;
  if (!data?.user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

// Redirect cerdas: auth -> /dashboard, unauth -> /
function SmartRedirect() {
  const { data, isPending } = useSession();
  if (isPending) return <div className="p-8 text-muted-foreground">Memuat...</div>;
  return <Navigate to={data?.user ? '/dashboard' : '/'} replace />;
}

export function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />

      {/* Protected routes wrapped in WizardLayout */}
      <Route
        element={
          <Protected>
            <WizardLayout />
          </Protected>
        }
      >
        <Route path="/dashboard" element={<ChatPage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/settings/billing" element={<BillingPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/chat/:sessionId" element={<ChatPage />} />
        <Route path="/projects/:projectId/techstack" element={<TechStackPage />} />
        <Route path="/projects/:projectId/prd" element={<PrdPage />} />
        <Route path="/projects/:projectId/brd" element={<PrdPage />} />
        <Route path="/projects/:projectId/tree" element={<TreePage />} />
        <Route path="/projects/:projectId/board" element={<BoardPage />} />
        <Route path="/projects/:projectId/settings" element={<SettingsPage />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<SmartRedirect />} />
    </Routes>
  );
}
