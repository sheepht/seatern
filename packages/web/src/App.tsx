import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/providers/AuthProvider';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AnalyticsTracker } from '@/components/AnalyticsTracker';
import LoginPage from '@/pages/LoginPage';
import RegisterPage from '@/pages/RegisterPage';
import ImportPage from '@/pages/ImportPage';
import WorkspaceLayout from '@/pages/WorkspaceLayout';
import WorkspacePage from '@/pages/WorkspacePage';
import GuestManagementPage from '@/pages/GuestManagementPage';
import AuthCallbackPage from '@/pages/AuthCallbackPage';
import SettingsPage from '@/pages/SettingsPage';
import PricingPage from '@/pages/PricingPage';
import AdminPage from '@/pages/AdminPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <AnalyticsTracker />
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/auth/callback" element={<AuthCallbackPage />} />

            {/* Workspace（Phase 1 不需要登入） */}
            <Route path="/" element={<WorkspaceLayout />}>
              <Route index element={<WorkspacePage />} />
              <Route path="guests" element={<GuestManagementPage />} />
              <Route path="import" element={<ImportPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="pricing" element={<PricingPage />} />
            </Route>

            {/* Admin（靠 URL 隱藏，不需要登入驗證） */}
            <Route path="/admin" element={<AdminPage />} />

            {/* Protected routes */}
            <Route path="/dashboard" element={<ProtectedRoute><DashboardPlaceholder /></ProtectedRoute>} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

function DashboardPlaceholder() {
  return (
    <div className="flex items-center justify-center p-12">
      <p className="text-gray-500 text-lg">Dashboard — 功能開發中</p>
    </div>
  );
}

export default App;
