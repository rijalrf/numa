import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/lib/auth-client';
import { api } from '@/lib/http';
import { LoginPage } from '@/pages/login';
const LandingPage = lazy(() => import('@/pages/landing').then((m) => ({ default: m.LandingPage })));
const OnboardingPage = lazy(() => import('@/pages/onboarding').then((m) => ({ default: m.OnboardingPage })));
const ProfilePage = lazy(() => import('@/pages/profile').then((m) => ({ default: m.ProfilePage })));
const OrgsPage = lazy(() => import('@/pages/orgs').then((m) => ({ default: m.OrgsPage })));
const ProjectsPage = lazy(() => import('@/pages/projects/index').then((m) => ({ default: m.ProjectsPage })));
const ChatPage = lazy(() => import('@/pages/chat').then((m) => ({ default: m.ChatPage })));
const SurveyPage = lazy(() => import('@/pages/projects/survey').then((m) => ({ default: m.SurveyPage })));
const TechStackPage = lazy(() => import('@/pages/projects/techstack').then((m) => ({ default: m.TechStackPage })));
const PrdPage = lazy(() => import('@/pages/projects/prd').then((m) => ({ default: m.PrdPage })));
const BoardPage = lazy(() => import('@/pages/projects/board').then((m) => ({ default: m.BoardPage })));
const SettingsPage = lazy(() => import('@/pages/projects/settings').then((m) => ({ default: m.SettingsPage })));
const BillingPage = lazy(() => import('@/pages/settings/billing').then((m) => ({ default: m.BillingPage })));
const AdminUsagePage = lazy(() => import('@/pages/admin/usage').then((m) => ({ default: m.AdminUsagePage })));
import WizardLayout from '@/components/layout/wizard-layout';

// Halaman dimuat per rute agar bundel awal kecil. Login dan layout tetap eager karena dipakai di jalur masuk.

function Protected({ children }: { children: React.ReactNode }) {
  const { data, isPending } = useSession();
  if (isPending) return <div className="p-8 text-muted-foreground">Memuat...</div>;
  if (!data?.user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

// Halaman admin platform. Bukan admin diarahkan ke /chat; API tetap membalas 404 untuk non-admin.
function RequirePlatformAdmin({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const q = useQuery({
    queryKey: ['user-profile'],
    queryFn: () => api<{ user: { onboardingCompletedAt: string | null; isPlatformAdmin?: boolean } }>('/api/user/profile'),
    enabled: !!session?.user,
    retry: false,
  });
  if (q.isLoading || q.isPending) return <div className="p-8 text-muted-foreground">Memuat...</div>;
  if (!q.data?.user?.isPlatformAdmin) return <Navigate to="/chat" replace />;
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
    <Suspense fallback={<div className="p-8 text-muted-foreground">Memuat...</div>}>
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
        <Route path="/orgs" element={<OrgsPage />} />
        <Route path="/settings/billing" element={<BillingPage />} />
        <Route
          path="/admin/usage"
          element={
            <RequirePlatformAdmin>
              <AdminUsagePage />
            </RequirePlatformAdmin>
          }
        />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/chat/:sessionId" element={<ChatPage />} />
        <Route path="/projects/:projectId/survey" element={<SurveyPage />} />
        <Route path="/projects/:projectId/interview" element={<SurveyPage />} />
        <Route path="/projects/:projectId/techstack" element={<TechStackPage />} />
        <Route path="/projects/:projectId/prd" element={<PrdPage />} />
        <Route path="/projects/:projectId/brd" element={<PrdPage />} />
        <Route path="/projects/:projectId/board" element={<BoardPage />} />
        <Route path="/projects/:projectId/settings" element={<SettingsPage />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<SmartRedirect />} />
    </Routes>
    </Suspense>
  );
}
