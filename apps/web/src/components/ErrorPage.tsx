import { useRouteError, isRouteErrorResponse, useNavigate } from 'react-router-dom';
import { BookHeart, Home, RefreshCw, AlertTriangle, FileQuestion } from 'lucide-react';
import { Button } from './ui/button';

interface ErrorPageProps {
  error?: Error | null;
  resetError?: () => void;
}

export default function ErrorPage({ error: propError, resetError }: ErrorPageProps) {
  const routeError = useRouteError();
  const navigate = useNavigate();
  
  // Use prop error if provided (for ErrorBoundary), otherwise use route error
  const error = propError ?? routeError;
  
  // Determine if this is a 404 or other error
  const is404 = isRouteErrorResponse(error) && error.status === 404;
  
  // Get error message
  let errorMessage = 'Something went wrong';
  let errorDetails = '';
  
  if (isRouteErrorResponse(error)) {
    errorMessage = error.status === 404 
      ? 'Page Not Found' 
      : `Error ${error.status}`;
    errorDetails = error.statusText || error.data?.message || '';
  } else if (error instanceof Error) {
    // errorMessage already defaults to 'Something went wrong'
    errorDetails = error.message;
  }

  const handleGoHome = () => {
    navigate('/');
  };

  const handleRefresh = () => {
    if (resetError) {
      resetError();
    } else {
      window.location.reload();
    }
  };

  const handleGoBack = () => {
    navigate(-1);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-white to-[rgb(var(--theme-gradient-to))] flex flex-col">
      {/* Minimal Header */}
      <nav className="border-b bg-white/90 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <button 
            onClick={handleGoHome}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <BookHeart className="size-6 text-[rgb(var(--theme-primary))]" />
            <span className="tracking-tight font-medium">Mosaic Life</span>
          </button>
        </div>
      </nav>

      {/* Error Content */}
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="max-w-md w-full text-center space-y-8">
          {/* Icon */}
          <div className="flex justify-center">
            <div className="w-24 h-24 rounded-full bg-[rgb(var(--theme-accent-light))] flex items-center justify-center">
              {is404 ? (
                <FileQuestion className="size-12 text-[rgb(var(--theme-primary))]" />
              ) : (
                <AlertTriangle className="size-12 text-[rgb(var(--theme-primary))]" />
              )}
            </div>
          </div>

          {/* Message */}
          <div className="space-y-3">
            <h1 className="text-4xl font-bold text-neutral-900">
              {is404 ? errorMessage : 'Oops!'}
            </h1>
            <p className="text-lg text-neutral-600">
              {is404 
                ? "The page you're looking for doesn't exist or has been moved."
                : "We encountered an unexpected error. Don't worry, it's not your fault."
              }
            </p>
            {errorDetails && !is404 && (
              <p className="text-sm text-neutral-500 bg-neutral-100 rounded-lg p-3 font-mono">
                {errorDetails}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              onClick={handleGoHome}
              className="bg-[rgb(var(--theme-primary))] hover:bg-[rgb(var(--theme-primary-dark))] text-white gap-2"
            >
              <Home className="size-4" />
              Go to Homepage
            </Button>
            
            {!is404 && (
              <Button
                onClick={handleRefresh}
                variant="outline"
                className="gap-2"
              >
                <RefreshCw className="size-4" />
                Try Again
              </Button>
            )}
            
            <Button
              onClick={handleGoBack}
              variant="ghost"
              className="text-neutral-600"
            >
              Go Back
            </Button>
          </div>

          {/* Decorative element */}
          <div className="pt-8">
            <p className="text-sm text-neutral-400">
              Need help? <a href="mailto:support@mosaiclife.com" className="text-[rgb(var(--theme-primary))] hover:underline">Contact Support</a>
            </p>
          </div>
        </div>
      </div>

      {/* Simple Footer */}
      <footer className="border-t bg-white/50 py-6">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <p className="text-sm text-neutral-500">
            © {new Date().getFullYear()} Mosaic Life. Honoring lives through shared stories.
          </p>
        </div>
      </footer>
    </div>
  );
}
