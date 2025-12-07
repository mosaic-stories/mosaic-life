import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/contexts/AuthContext';
import { router } from '@/routes';
import { useEffect } from 'react';
import { applyTheme } from '@/lib/themeUtils';
import ErrorBoundary from '@/components/ErrorBoundary';

// Create a client for TanStack Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

export default function App() {
  // Apply initial theme on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('mosaic-theme') || 'warm-amber';
    applyTheme(savedTheme);
  }, []);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
