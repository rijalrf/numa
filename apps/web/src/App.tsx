import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/lib/auth-client';
import { api } from '@/lib/http';
import { LoginPage } from '@/pages/login';
import { LandingPage } from '@/pages/landing';
import { OnboardingPage } from '@/pages/onboarding';
import { ProfilePage } from '@/pages/profile';
import { ProjectsPage } from '@/pages/projects/index';
import { ChatPage } from '@/pages/chat';
import { SurveyPage } from '@/pages/projects/survey';
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

function RequireOnboarding({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { data: session } = useSession();
  const q = useQuery({
    queryKey: ['user-profile'],
    queryFn: () => api<{ user: { onboardingCompletedAt: string | null } }>('/api/user/profile'),
    enabled: !!session?.user,
    retry: false,
  });

  if (q.isLoading || q.isPending) return <div className="p-8 text-muted-foreground">Memuat...</div>;
  if (q.isError) return <div className="p-8 text-destructive">Gagal memuat profil. Muat ulang halaman.</div>;

  const done = !!q.data?.user?.onboardingCompletedAt;
  if (!done && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }
  if (done && location.pathname === '/onboarding') {
    return <Navigate to="/chat" replace />;
  }

  return <>{children}</>;
}

// Redirect cerdas: auth -> /chat, unauth -> /
function SmartRedirect() {
  const { data, isPending } = useSession();
  if (isPending) return <div className="p-8 text-muted-foreground">Memuat...</div>;
  return <Navigate to={data?.user ? '/chat' : '/'} replace />;
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
            <RequireOnboarding>
              <WizardLayout />
            </RequireOnboarding>
          </Protected>
        }
      >
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/dashboard" element={<Navigate to="/chat" replace />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/settings/billing" element={<BillingPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/chat/:sessionId" element={<ChatPage />} />
        <Route path="/projects/:projectId/survey" element={<SurveyPage />} />
        <Route path="/projects/:projectId/interview" element={<SurveyPage />} />
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
