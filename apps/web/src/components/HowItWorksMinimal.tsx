import { ArrowLeft, User, Pencil, Users, Image, Sparkles, Share2, Globe, BookHeart } from 'lucide-react';
import { Button } from './ui/button';
import ThemeSelector from './ThemeSelector';
import UserProfileDropdown from './UserProfileDropdown';
import { NotificationBell } from './notifications';

interface HowItWorksMinimalProps {
  onNavigate: (view: string) => void;
  onSelectLegacy: (id: string) => void;
  currentTheme: string;
  onThemeChange: (theme: string) => void;
  user: { name: string; email: string; avatarUrl?: string } | null;
  onAuthClick: () => void;
  onSignOut: () => void;
}

export default function HowItWorksMinimal({ 
  onNavigate,
  onSelectLegacy: _onSelectLegacy,
  currentTheme,
  onThemeChange,
  user,
  onAuthClick,
  onSignOut
}: HowItWorksMinimalProps) {
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
              onClick={() => onNavigate('how-it-works')}
              className="text-xs px-3 py-1.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-700 transition-colors"
            >
              Full Version
            </button>
            <ThemeSelector currentTheme={currentTheme} onThemeChange={onThemeChange} />
            {user ? (
              <>
                <NotificationBell />
                <UserProfileDropdown user={user} onNavigate={onNavigate} onSignOut={onSignOut} />
              </>
            ) : (
              <Button onClick={onAuthClick} size="sm">Sign In</Button>
            )}
          </div>
        </div>
      </nav>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-20 mt-16">
        {/* Back Button */}
        <Button 
          variant="ghost" 
          onClick={() => onNavigate('home-minimal')}
          className="gap-2 mb-12"
        >
          <ArrowLeft className="size-4" />
          Back
        </Button>

        {/* Title */}
        <div className="text-center mb-20">
          <h1 className="text-neutral-900 mb-4">How It Works</h1>
          <p className="text-xl text-neutral-600">Simple. Clear. Meaningful.</p>
        </div>

        {/* Steps */}
        <div className="space-y-16 mb-20">
          {/* Step 1 */}
          <div className="flex gap-8 items-start">
            <div className="size-14 rounded-2xl bg-[rgb(var(--theme-primary))] text-white flex items-center justify-center flex-shrink-0 text-xl">
              1
            </div>
            <div className="flex-1">
              <h2 className="text-neutral-900 mb-4">Create</h2>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <User className="size-5 text-[rgb(var(--theme-primary))] mt-0.5 flex-shrink-0" />
                  <p className="text-neutral-600">Add basic details</p>
                </div>
                <div className="flex items-start gap-3">
                  <Image className="size-5 text-[rgb(var(--theme-primary))] mt-0.5 flex-shrink-0" />
                  <p className="text-neutral-600">Upload a photo</p>
                </div>
              </div>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex gap-8 items-start">
            <div className="size-14 rounded-2xl bg-[rgb(var(--theme-primary))] text-white flex items-center justify-center flex-shrink-0 text-xl">
              2
            </div>
            <div className="flex-1">
              <h2 className="text-neutral-900 mb-4">Add Content</h2>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <Pencil className="size-5 text-[rgb(var(--theme-primary))] mt-0.5 flex-shrink-0" />
                  <p className="text-neutral-600">Write stories</p>
                </div>
                <div className="flex items-start gap-3">
                  <Image className="size-5 text-[rgb(var(--theme-primary))] mt-0.5 flex-shrink-0" />
                  <p className="text-neutral-600">Build photo gallery</p>
                </div>
                <div className="flex items-start gap-3">
                  <Sparkles className="size-5 text-[rgb(var(--theme-primary))] mt-0.5 flex-shrink-0" />
                  <p className="text-neutral-600">Get AI help</p>
                </div>
              </div>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex gap-8 items-start">
            <div className="size-14 rounded-2xl bg-[rgb(var(--theme-primary))] text-white flex items-center justify-center flex-shrink-0 text-xl">
              3
            </div>
            <div className="flex-1">
              <h2 className="text-neutral-900 mb-4">Invite</h2>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <Users className="size-5 text-[rgb(var(--theme-primary))] mt-0.5 flex-shrink-0" />
                  <p className="text-neutral-600">Share invite link</p>
                </div>
                <div className="flex items-start gap-3">
                  <Pencil className="size-5 text-[rgb(var(--theme-primary))] mt-0.5 flex-shrink-0" />
                  <p className="text-neutral-600">Others add stories</p>
                </div>
              </div>
            </div>
          </div>

          {/* Step 4 */}
          <div className="flex gap-8 items-start">
            <div className="size-14 rounded-2xl bg-[rgb(var(--theme-primary))] text-white flex items-center justify-center flex-shrink-0 text-xl">
              4
            </div>
            <div className="flex-1">
              <h2 className="text-neutral-900 mb-4">Share</h2>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <Share2 className="size-5 text-[rgb(var(--theme-primary))] mt-0.5 flex-shrink-0" />
                  <p className="text-neutral-600">Send to family & friends</p>
                </div>
                <div className="flex items-start gap-3">
                  <Globe className="size-5 text-[rgb(var(--theme-primary))] mt-0.5 flex-shrink-0" />
                  <p className="text-neutral-600">Choose public or private</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="bg-[rgb(var(--theme-primary))] rounded-2xl p-12 text-center text-white">
          <h2 className="text-white mb-4">Ready?</h2>
          <p className="text-white/80 mb-8">Start your first tribute now</p>
          <Button 
            size="lg"
            onClick={onAuthClick}
            className="bg-white text-[rgb(var(--theme-primary))] hover:bg-neutral-100 h-14 px-8"
          >
            Get Started
          </Button>
        </div>
      </div>
    </div>
  );
}