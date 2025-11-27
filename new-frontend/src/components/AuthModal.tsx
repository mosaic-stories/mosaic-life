import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import googleLogo from '../assets/google-logo.svg';
import microsoftLogo from '../assets/microsoft-logo.svg';
import facebookLogo from '../assets/facebook-logo.svg';
import linkedinLogo from '../assets/linkedin-logo.svg';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthenticate: (provider: string) => void;
}

export default function AuthModal({ isOpen, onClose, onAuthenticate }: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSocialLogin = async (provider: string) => {
    setIsLoading(true);
    // Simulate OAuth flow
    await new Promise(resolve => setTimeout(resolve, 1000));
    onAuthenticate(provider);
    setIsLoading(false);
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    // Simulate email auth
    await new Promise(resolve => setTimeout(resolve, 1000));
    onAuthenticate('email');
    setIsLoading(false);
  };

  const socialButtons = [
    {
      provider: 'google',
      label: 'Continue with Google',
      icon: '🔵', // Will be replaced with actual logos
      bgColor: 'bg-white hover:bg-neutral-50',
      textColor: 'text-neutral-900',
      borderColor: 'border-neutral-300'
    },
    {
      provider: 'microsoft',
      label: 'Continue with Microsoft',
      icon: '🪟',
      bgColor: 'bg-white hover:bg-neutral-50',
      textColor: 'text-neutral-900',
      borderColor: 'border-neutral-300'
    },
    {
      provider: 'facebook',
      label: 'Continue with Facebook',
      icon: '📘',
      bgColor: 'bg-[#1877F2] hover:bg-[#0C63D4]',
      textColor: 'text-white',
      borderColor: 'border-[#1877F2]'
    },
    {
      provider: 'linkedin',
      label: 'Continue with LinkedIn',
      icon: '💼',
      bgColor: 'bg-[#0A66C2] hover:bg-[#004182]',
      textColor: 'text-white',
      borderColor: 'border-[#0A66C2]'
    }
  ];

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
          {/* Social Login Buttons */}
          {!showEmailForm && (
            <div className="space-y-3">
              {socialButtons.map((button) => (
                <Button
                  key={button.provider}
                  onClick={() => handleSocialLogin(button.provider)}
                  disabled={isLoading}
                  className={`w-full h-12 ${button.bgColor} ${button.textColor} border ${button.borderColor} hover:shadow-md transition-all`}
                  variant="outline"
                >
                  <span className="text-xl mr-3">{button.icon}</span>
                  {button.label}
                </Button>
              ))}
            </div>
          )}

          {/* Divider */}
          {!showEmailForm && (
            <div className="relative py-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-neutral-200"></div>
              </div>
              <div className="relative flex justify-center">
                <button
                  onClick={() => setShowEmailForm(true)}
                  className="bg-white px-4 text-sm text-neutral-500 hover:text-neutral-900 transition-colors"
                >
                  or continue with email
                </button>
              </div>
            </div>
          )}

          {/* Email Form */}
          {showEmailForm && (
            <form onSubmit={handleEmailAuth} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm text-neutral-700">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[rgb(var(--theme-primary))] focus:border-transparent"
                  required
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="password" className="text-sm text-neutral-700">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[rgb(var(--theme-primary))] focus:border-transparent"
                  required
                />
              </div>
              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-12 bg-[rgb(var(--theme-primary))] hover:bg-[rgb(var(--theme-primary-dark))] text-white"
              >
                {isLoading ? 'Authenticating...' : mode === 'login' ? 'Sign In' : 'Sign Up'}
              </Button>
              <button
                type="button"
                onClick={() => setShowEmailForm(false)}
                className="w-full text-sm text-neutral-500 hover:text-neutral-900 transition-colors"
              >
                Back to social login
              </button>
            </form>
          )}

          {/* Toggle Mode */}
          <div className="text-center pt-4 border-t border-neutral-100">
            <p className="text-sm text-neutral-600">
              {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
              <button
                onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
                className="text-[rgb(var(--theme-primary))] hover:text-[rgb(var(--theme-primary-dark))] transition-colors"
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