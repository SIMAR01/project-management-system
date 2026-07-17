import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Loader2 } from 'lucide-react';

// Setup React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false, // Don't retry queries infinitely on 401/403/404 errors
      refetchOnWindowFocus: true,
    },
  },
});

// Lazy load layout components for chunking and speed optimizations
const AuthLayout = React.lazy(() =>
  import('./features/auth/components/AuthLayout').then((m) => ({ default: m.AuthLayout }))
);
const DashboardLayout = React.lazy(() =>
  import('./features/dashboard/components/DashboardLayout').then((m) => ({ default: m.DashboardLayout }))
);
const WorkspaceDashboard = React.lazy(() =>
  import('./features/projects/components/WorkspaceDashboard').then((m) => ({ default: m.WorkspaceDashboard }))
);
const KanbanBoard = React.lazy(() =>
  import('./features/tasks/components/KanbanBoard').then((m) => ({ default: m.KanbanBoard }))
);

// Loader component for Route Suspense
const FullScreenLoader: React.FC = () => (
  <div className="min-h-screen w-full flex flex-col items-center justify-center bg-slate-950 text-slate-100">
    <div className="flex flex-col items-center">
      <Loader2 className="w-10 h-10 animate-spin text-brand-500 mb-3.5" />
      <p className="text-sm text-slate-400 font-semibold tracking-wider uppercase">Loading...</p>
    </div>
  </div>
);

// Guard component for authentication
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <FullScreenLoader />;
  }

  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
};

// Guard component to prevent authenticated users from accessing login/signup
const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <FullScreenLoader />;
  }

  return isAuthenticated ? <Navigate to="/dashboard" replace /> : <>{children}</>;
};

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<FullScreenLoader />}>
            <Routes>
              {/* Public Authentication Screens */}
              <Route
                path="/login"
                element={
                  <PublicRoute>
                    <AuthLayout />
                  </PublicRoute>
                }
              />

              {/* Protected Workspace Console Dashboard */}
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <DashboardLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<WorkspaceDashboard />} />
                <Route path="projects/:projectId/tasks" element={<KanbanBoard />} />
              </Route>

              {/* Catch-all Routing Redirects */}
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
};
