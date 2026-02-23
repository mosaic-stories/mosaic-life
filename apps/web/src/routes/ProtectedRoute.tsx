import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-theme-background">
        <div className="animate-pulse text-theme-primary">
          Checking authentication...
        </div>
      </div>
    );
  }

  // Redirect to home if not authenticated
  if (!user) {
    // Store the attempted location so we can redirect after login
    return <Navigate to="/" state={{ from: location, showAuth: true }} replace />;
  }

  return <>{children}</>;
}
