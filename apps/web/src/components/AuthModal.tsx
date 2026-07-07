import { useState } from 'react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { useAuth } from '../contexts/AuthContext';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthenticate: (provider: string) => void;
}

function GoogleIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

function KeycloakIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="11" fill="#4D9ABF" />
      <path
        d="M7 8.5h4.5l1.5 3.5-1.5 3.5H7l1.5-3.5L7 8.5z"
        fill="white"
      />
      <path d="M12.5 12H17" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export default function AuthModal({ isOpen, onClose, onAuthenticate: _onAuthenticate }: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const { activeProvider, login } = useAuth();

  const handleLogin = () => {
    login();
  };

  const providerButton =
    activeProvider === 'keycloak'
      ? {
          provider: 'keycloak',
          label: 'Continue with Keycloak',
          icon: <KeycloakIcon />,
          bgColor: 'bg-white hover:bg-neutral-50',
          textColor: 'text-neutral-900',
          borderColor: 'border-neutral-300',
        }
      : {
          provider: 'google',
          label: 'Continue with Google',
          icon: <GoogleIcon />,
          bgColor: 'bg-white hover:bg-neutral-50',
          textColor: 'text-neutral-900',
          borderColor: 'border-neutral-300',
        };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[480px] p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-8 pt-8 pb-6 space-y-2">
          <DialogTitle className="text-center text-neutral-900">
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </DialogTitle>
          <DialogDescription className="text-center text-sm text-neutral-600">
            {mode === 'login'
              ? 'Sign in to continue to Mosaic Life'
              : 'Start preserving meaningful stories'}
          </DialogDescription>
        </DialogHeader>

        {/* Body */}
        <div className="px-8 pb-8 space-y-4">
          <div className="space-y-3">
            <Button
              onClick={handleLogin}
              className={`w-full h-12 ${providerButton.bgColor} ${providerButton.textColor} border ${providerButton.borderColor} hover:shadow-md transition-all flex items-center justify-center gap-3`}
              variant="outline"
            >
              {providerButton.icon}
              {providerButton.label}
            </Button>
          </div>

          <p className="text-xs text-center text-neutral-500 pt-2">
            By signing in, you agree to our Terms of Service and Privacy Policy
          </p>

          <div className="text-center pt-4 border-t border-neutral-100">
            <p className="text-sm text-neutral-600">
              {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
              <button
                onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
                className="text-theme-primary hover:text-theme-primary-dark transition-colors"
              >
                {mode === 'login' ? 'Sign up' : 'Sign in'}
              </button>
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
