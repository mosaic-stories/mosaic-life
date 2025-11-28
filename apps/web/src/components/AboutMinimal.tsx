import { ArrowLeft, Heart, Shield, Globe, BookHeart } from 'lucide-react';
import { Button } from './ui/button';
import ThemeSelector from './ThemeSelector';
import UserProfileDropdown from './UserProfileDropdown';

interface AboutMinimalProps {
  onNavigate: (view: string) => void;
  onSelectLegacy: (id: string) => void;
  currentTheme: string;
  onThemeChange: (theme: string) => void;
  user: { name: string; email: string; avatarUrl?: string } | null;
  onAuthClick: () => void;
  onSignOut: () => void;
}

export default function AboutMinimal({ 
  onNavigate,
  onSelectLegacy,
  currentTheme,
  onThemeChange,
  user,
  onAuthClick,
  onSignOut
}: AboutMinimalProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-white to-[rgb(var(--theme-bg))]">
      {/* Navigation */}
      <nav className="border-b bg-white/90 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <button 
            onClick={() => onNavigate('home-minimal')}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <BookHeart className="size-6 text-[rgb(var(--theme-primary))]" />
            <span className="tracking-tight">Mosaic Life</span>
          </button>
          
          <div className="flex items-center gap-4">
            <button
              onClick={() => onNavigate('about')}
              className="text-xs px-3 py-1.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-700 transition-colors"
            >
              Full Version
            </button>
            <ThemeSelector currentTheme={currentTheme} onThemeChange={onThemeChange} />
            {user ? (
              <UserProfileDropdown user={user} onNavigate={onNavigate} onSignOut={onSignOut} />
            ) : (
              <Button onClick={onAuthClick} size="sm">Sign In</Button>
            )}
          </div>
        </div>
      </nav>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-6 py-20 mt-16">
        {/* Back Button */}
        <Button 
          variant="ghost" 
          onClick={() => onNavigate('home-minimal')}
          className="gap-2 mb-12"
        >
          <ArrowLeft className="size-4" />
          Back
        </Button>

        {/* Mission */}
        <div className="mb-20 text-center">
          <h1 className="text-neutral-900 mb-6">Our Mission</h1>
          <p className="text-xl text-neutral-700">
            Preserve memories.<br />
            Honor lives.<br />
            Connect people.
          </p>
        </div>

        {/* Values */}
        <div className="space-y-16 mb-20">
          <div className="flex gap-6">
            <div className="size-12 rounded-xl bg-[rgb(var(--theme-bg))] flex items-center justify-center flex-shrink-0">
              <Heart className="size-6 text-[rgb(var(--theme-primary))]" />
            </div>
            <div>
              <h3 className="text-neutral-900 mb-2">Respect</h3>
              <p className="text-neutral-600">
                Every story matters. We handle memories with care.
              </p>
            </div>
          </div>

          <div className="flex gap-6">
            <div className="size-12 rounded-xl bg-[rgb(var(--theme-bg))] flex items-center justify-center flex-shrink-0">
              <Shield className="size-6 text-[rgb(var(--theme-primary))]" />
            </div>
            <div>
              <h3 className="text-neutral-900 mb-2">Privacy</h3>
              <p className="text-neutral-600">
                Your data is yours. We protect it.
              </p>
            </div>
          </div>

          <div className="flex gap-6">
            <div className="size-12 rounded-xl bg-[rgb(var(--theme-bg))] flex items-center justify-center flex-shrink-0">
              <Globe className="size-6 text-[rgb(var(--theme-primary))]" />
            </div>
            <div>
              <h3 className="text-neutral-900 mb-2">Access</h3>
              <p className="text-neutral-600">
                Simple tools for everyone.
              </p>
            </div>
          </div>
        </div>

        {/* Story */}
        <div className="bg-[rgb(var(--theme-bg))] p-10 rounded-2xl border border-[rgb(var(--theme-border))]">
          <h3 className="text-neutral-900 mb-4">Why We Built This</h3>
          <p className="text-neutral-600 mb-4">
            When someone special leaves our lives, we scramble to collect stories. We text, call, search through old photos.
          </p>
          <p className="text-neutral-600 mb-4">
            There should be a better way.
          </p>
          <p className="text-neutral-600">
            Mosaic Life brings everyone together in one place. Share memories, build tributes, celebrate lives.
          </p>
        </div>
      </div>
    </div>
  );
}