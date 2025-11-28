import { BookHeart, Home, Info, Users, ArrowRight, ImageIcon, Sparkles } from 'lucide-react';
import { Button } from './ui/button';
import ThemeSelector from './ThemeSelector';
import UserProfileDropdown from './UserProfileDropdown';
import Footer from './Footer';
import DogearToggle from './DogearToggle';

interface HomePageMinimalProps {
  onNavigate: (view: string) => void;
  onSelectLegacy: (id: string) => void;
  currentTheme: string;
  onThemeChange: (theme: string) => void;
  user: { name: string; email: string; avatarUrl?: string } | null;
  onAuthClick: () => void;
  onSignOut: () => void;
}

export default function HomePageMinimal({ 
  onNavigate, 
  onSelectLegacy, 
  currentTheme, 
  onThemeChange,
  user,
  onAuthClick,
  onSignOut
}: HomePageMinimalProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-white to-[rgb(var(--theme-bg))]">
      {/* Dogear Toggle */}
      <DogearToggle isSimpleView={true} onToggle={() => onNavigate('home')} />
      
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
              onClick={() => onNavigate('my-legacies-minimal')}
              className="text-sm text-neutral-600 hover:text-[rgb(var(--theme-primary))]"
            >
              My Tributes
            </button>
            <button 
              onClick={() => onNavigate('explore-minimal')}
              className="text-sm text-neutral-600 hover:text-[rgb(var(--theme-primary))]"
            >
              Explore
            </button>
            <button 
              onClick={() => onNavigate('community-minimal')}
              className="text-sm text-neutral-600 hover:text-[rgb(var(--theme-primary))]"
            >
              Communities
            </button>
            <button
              onClick={() => onNavigate('home')}
              className="text-xs px-3 py-1.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-700 transition-colors"
            >
              Full Version
            </button>
            <ThemeSelector currentTheme={currentTheme} onThemeChange={onThemeChange} />
            {user ? (
              <UserProfileDropdown user={user} onNavigate={onNavigate} onSignOut={onSignOut} />
            ) : (
              <Button onClick={onAuthClick} size="sm" variant="outline">Sign In</Button>
            )}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <div className="max-w-4xl mx-auto px-6 pt-32 pb-20 text-center">
        <h1 className="text-6xl mb-6 text-neutral-900">
          Honor Lives.<br />Share Stories.
        </h1>
        <p className="text-xl text-neutral-600 mb-12 max-w-2xl mx-auto">
          Create beautiful digital tributes for the people who matter.
        </p>
        <Button 
          size="lg" 
          onClick={onAuthClick}
          className="bg-[rgb(var(--theme-primary))] hover:bg-[rgb(var(--theme-primary-dark))] text-white h-14 px-8 gap-2"
        >
          Start Now
          <ArrowRight className="size-5" />
        </Button>
      </div>

      {/* What It Does */}
      <div className="max-w-5xl mx-auto px-6 py-20">
        <div className="grid md:grid-cols-3 gap-12">
          <div className="text-center">
            <div className="size-16 rounded-2xl bg-[rgb(var(--theme-primary))] text-white flex items-center justify-center mx-auto mb-6">
              <Users className="size-8" />
            </div>
            <h3 className="text-neutral-900 mb-3">Collect Stories</h3>
            <p className="text-neutral-600">
              Invite others to share memories
            </p>
          </div>

          <div className="text-center">
            <div className="size-16 rounded-2xl bg-[rgb(var(--theme-primary))] text-white flex items-center justify-center mx-auto mb-6">
              <ImageIcon className="size-8" />
            </div>
            <h3 className="text-neutral-900 mb-3">Build Gallery</h3>
            <p className="text-neutral-600">
              Organize photos and videos
            </p>
          </div>

          <div className="text-center">
            <div className="size-16 rounded-2xl bg-[rgb(var(--theme-primary))] text-white flex items-center justify-center mx-auto mb-6">
              <Sparkles className="size-8" />
            </div>
            <h3 className="text-neutral-900 mb-3">AI Assistance</h3>
            <p className="text-neutral-600">
              Get help writing and organizing
            </p>
          </div>
        </div>
      </div>

      {/* Use Cases */}
      <div className="bg-white py-20">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-center text-neutral-900 mb-16">Perfect For</h2>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="p-6 border border-[rgb(var(--theme-border))] rounded-2xl hover:border-[rgb(var(--theme-primary))] transition-colors">
              <p className="text-neutral-900 mb-2">Memorials</p>
              <p className="text-sm text-neutral-500">Remember loved ones</p>
            </div>

            <div className="p-6 border border-[rgb(var(--theme-border))] rounded-2xl hover:border-[rgb(var(--theme-primary))] transition-colors">
              <p className="text-neutral-900 mb-2">Retirements</p>
              <p className="text-sm text-neutral-500">Celebrate careers</p>
            </div>

            <div className="p-6 border border-[rgb(var(--theme-border))] rounded-2xl hover:border-[rgb(var(--theme-primary))] transition-colors">
              <p className="text-neutral-900 mb-2">Graduations</p>
              <p className="text-sm text-neutral-500">Mark achievements</p>
            </div>

            <div className="p-6 border border-[rgb(var(--theme-border))] rounded-2xl hover:border-[rgb(var(--theme-primary))] transition-colors">
              <p className="text-neutral-900 mb-2">Living Tributes</p>
              <p className="text-sm text-neutral-500">Honor the living</p>
            </div>
          </div>
        </div>
      </div>

      {/* How It Works */}
      <div className="max-w-4xl mx-auto px-6 py-20">
        <h2 className="text-center text-neutral-900 mb-16">Three Simple Steps</h2>
        
        <div className="space-y-8">
          <div className="flex items-start gap-6">
            <div className="size-10 rounded-full bg-[rgb(var(--theme-primary))] text-white flex items-center justify-center flex-shrink-0">
              1
            </div>
            <div>
              <h3 className="text-neutral-900 mb-2">Create Profile</h3>
              <p className="text-neutral-600">Set up a tribute page in minutes</p>
            </div>
          </div>

          <div className="flex items-start gap-6">
            <div className="size-10 rounded-full bg-[rgb(var(--theme-primary))] text-white flex items-center justify-center flex-shrink-0">
              2
            </div>
            <div>
              <h3 className="text-neutral-900 mb-2">Add Content</h3>
              <p className="text-neutral-600">Upload photos, write stories, invite others</p>
            </div>
          </div>

          <div className="flex items-start gap-6">
            <div className="size-10 rounded-full bg-[rgb(var(--theme-primary))] text-white flex items-center justify-center flex-shrink-0">
              3
            </div>
            <div>
              <h3 className="text-neutral-900 mb-2">Share</h3>
              <p className="text-neutral-600">Send the link to family and friends</p>
            </div>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="bg-[rgb(var(--theme-primary))] text-white py-20">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-white mb-6">Ready to Begin?</h2>
          <p className="text-white/80 mb-8 text-lg">
            Create your first tribute today
          </p>
          <Button 
            size="lg"
            onClick={onAuthClick}
            className="bg-white text-[rgb(var(--theme-primary))] hover:bg-neutral-100 h-14 px-8 gap-2"
          >
            Get Started
            <ArrowRight className="size-5" />
          </Button>
        </div>
      </div>

      {/* Footer Links */}
      <div className="bg-white border-t border-neutral-200 py-8">
        <div className="max-w-5xl mx-auto px-6">
          <div className="flex flex-wrap justify-center gap-8 text-sm text-neutral-600">
            <button onClick={() => onNavigate('about-minimal')} className="hover:text-[rgb(var(--theme-primary))]">
              About
            </button>
            <button onClick={() => onNavigate('how-it-works-minimal')} className="hover:text-[rgb(var(--theme-primary))]">
              How It Works
            </button>
            <button onClick={() => onNavigate('community')} className="hover:text-[rgb(var(--theme-primary))]">
              Community
            </button>
            <button onClick={() => onNavigate('help')} className="hover:text-[rgb(var(--theme-primary))]">
              Help
            </button>
            <button onClick={() => onNavigate('privacy')} className="hover:text-[rgb(var(--theme-primary))]">
              Privacy
            </button>
            <button onClick={() => onNavigate('terms')} className="hover:text-[rgb(var(--theme-primary))]">
              Terms
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}