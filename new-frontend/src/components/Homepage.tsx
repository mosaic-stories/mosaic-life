import { ArrowRight, BookHeart, Sparkles, Bell, Plus, Maximize2 } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { legacies } from '../lib/mockData';
import ThemeSelector from './ThemeSelector';
import UserProfileDropdown from './UserProfileDropdown';
import Footer from './Footer';
import SearchBar from './SearchBar';
import DogearToggle from './DogearToggle';

interface HomepageProps {
  onNavigate: (view: string) => void;
  onSelectLegacy: (legacyId: string) => void;
  currentTheme: string;
  onThemeChange: (themeId: string) => void;
  user: { name: string; email: string; avatarUrl?: string } | null;
  onAuthClick: () => void;
  onSignOut: () => void;
}

export default function Homepage({ onNavigate, onSelectLegacy, currentTheme, onThemeChange, user, onAuthClick, onSignOut }: HomepageProps) {
  const contextLabels = {
    'memorial': 'In Memoriam',
    'retirement': 'Retirement',
    'graduation': 'Graduation',
    'living-tribute': 'Living Tribute'
  };

  const contextColors = {
    'memorial': 'bg-amber-100 text-amber-800 border-amber-200',
    'retirement': 'bg-blue-100 text-blue-800 border-blue-200',
    'graduation': 'bg-emerald-100 text-emerald-800 border-emerald-200',
    'living-tribute': 'bg-purple-100 text-purple-800 border-purple-200'
  };

  const handleSearchSelect = (type: string, id: string) => {
    if (type === 'legacy') {
      onSelectLegacy(id);
    } else if (type === 'community') {
      onNavigate('community');
    } else if (type === 'story') {
      onSelectLegacy(id); // Navigate to the legacy containing this story
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Dogear Toggle */}
      <DogearToggle isSimpleView={false} onToggle={() => onNavigate('home-minimal')} />

      {/* Navigation */}
      <nav className="border-b bg-white/90 backdrop-blur-sm sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <button 
            onClick={() => onNavigate('home')}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity flex-shrink-0"
          >
            <BookHeart className="size-6 text-[rgb(var(--theme-primary))]" />
            <span className="tracking-tight">Mosaic Life</span>
          </button>
          
          {/* Search Bar - Center */}
          <div className="flex-1 max-w-2xl hidden md:block">
            <SearchBar onSelectResult={handleSearchSelect} compact />
          </div>
          
          {/* Not Logged In State */}
          {!user && (
            <div className="flex items-center gap-4 flex-shrink-0">
              <button 
                onClick={() => onNavigate('home')}
                className="text-neutral-600 hover:text-neutral-900 transition-colors hidden md:block"
              >
                Home
              </button>
              <button 
                onClick={() => onNavigate('about')}
                className="text-neutral-600 hover:text-neutral-900 transition-colors hidden md:block"
              >
                About
              </button>
              <button 
                onClick={() => onNavigate('how-it-works')}
                className="text-neutral-600 hover:text-neutral-900 transition-colors hidden md:block"
              >
                How It Works
              </button>
              <button 
                onClick={() => onNavigate('community')}
                className="text-neutral-600 hover:text-neutral-900 transition-colors hidden md:block"
              >
                Community
              </button>
              <ThemeSelector currentTheme={currentTheme} onThemeChange={onThemeChange} />
              <Button onClick={onAuthClick} size="sm">Sign In</Button>
            </div>
          )}
          
          {/* Logged In State */}
          {user && (
            <div className="flex items-center gap-4 flex-shrink-0">
              <button 
                onClick={() => onNavigate('home')}
                className="text-neutral-600 hover:text-neutral-900 transition-colors hidden md:block"
              >
                Home
              </button>
              <button 
                onClick={() => onNavigate('my-legacies')}
                className="text-neutral-600 hover:text-neutral-900 transition-colors hidden md:block"
              >
                My Legacies
              </button>
              <button 
                onClick={() => onNavigate('how-it-works')}
                className="text-neutral-600 hover:text-neutral-900 transition-colors hidden md:block"
              >
                How It Works
              </button>
              <button 
                onClick={() => onNavigate('community')}
                className="text-neutral-600 hover:text-neutral-900 transition-colors hidden md:block"
              >
                Community
              </button>
              <ThemeSelector currentTheme={currentTheme} onThemeChange={onThemeChange} />
              <Button 
                onClick={() => onNavigate('story')}
                size="sm"
                className="gap-2 bg-[rgb(var(--theme-primary))] hover:bg-[rgb(var(--theme-primary-dark))]"
              >
                <Plus className="size-4" />
                <span className="hidden sm:inline">Create Legacy</span>
              </Button>
              <UserProfileDropdown user={user} onNavigate={onNavigate} onSignOut={onSignOut} />
            </div>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-6 py-20">
        <div className="max-w-3xl mx-auto text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[rgb(var(--theme-accent-light))] border border-[rgb(var(--theme-accent))]">
            <Sparkles className="size-4 text-[rgb(var(--theme-primary))]" />
            <span className="text-sm text-[rgb(var(--theme-primary-dark))]\">Digital tributes powered by AI</span>
          </div>
          
          <h1 className="text-neutral-900">
            Honor the lives and milestones that matter most
          </h1>
          
          <p className="text-neutral-600">
            Create meaningful digital tributes for memorials, retirements, graduations, and living legacies. 
            Preserve memories, share stories, and celebrate what makes each person special.
          </p>

          <div className="flex gap-4 justify-center pt-4">
            <Button 
              size="lg" 
              className="gap-2 bg-[rgb(var(--theme-primary))] hover:bg-[rgb(var(--theme-primary-dark))]"
              onClick={user ? () => onNavigate('story') : onAuthClick}
            >
              Create a Legacy
              <ArrowRight className="size-4" />
            </Button>
            <Button size="lg" variant="outline">
              See Examples
            </Button>
          </div>
        </div>
      </section>

      {/* My Legacies - Only shown when logged in */}
      {user && (
        <section className="bg-neutral-50 py-20">
          <div className="max-w-7xl mx-auto px-6">
            <div className="flex items-center justify-between mb-8">
              <div className="space-y-2">
                <h2 className="text-neutral-900">My Legacies</h2>
                <p className="text-neutral-600">
                  The tributes you've created and manage
                </p>
              </div>
              <Button 
                onClick={() => onNavigate('story')}
                className="gap-2 bg-[rgb(var(--theme-primary))] hover:bg-[rgb(var(--theme-primary-dark))]"
              >
                <Plus className="size-4" />
                Create New
              </Button>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* User's Own Legacies - Mock Data */}
              <Card 
                className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer group"
                onClick={() => onSelectLegacy('1')}
              >
                <div className="aspect-[4/3] overflow-hidden bg-neutral-100">
                  <img 
                    src="https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=800&h=600&fit=crop" 
                    alt="Sarah Chen"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
                <div className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1 flex-1">
                      <h3 className="text-neutral-900">Sarah Chen</h3>
                      <p className="text-sm text-neutral-500">1982 - 2024</p>
                    </div>
                    <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-200">
                      In Memoriam
                    </Badge>
                  </div>
                  
                  <p className="text-sm text-neutral-600 line-clamp-2">
                    Beloved teacher, mentor, and friend
                  </p>

                  <div className="flex items-center gap-4 pt-2 text-sm text-neutral-500">
                    <span>12 stories</span>
                    <span>•</span>
                    <span>45 photos</span>
                    <span>•</span>
                    <span>8 contributors</span>
                  </div>
                </div>
              </Card>

              <Card 
                className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer group"
                onClick={() => onSelectLegacy('3')}
              >
                <div className="aspect-[4/3] overflow-hidden bg-neutral-100">
                  <img 
                    src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&h=600&fit=crop" 
                    alt="James Martinez"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
                <div className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1 flex-1">
                      <h3 className="text-neutral-900">James Martinez</h3>
                      <p className="text-sm text-neutral-500">Graduated 2024</p>
                    </div>
                    <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-200">
                      Graduation
                    </Badge>
                  </div>
                  
                  <p className="text-sm text-neutral-600 line-clamp-2">
                    Computer Science graduate ready to change the world
                  </p>

                  <div className="flex items-center gap-4 pt-2 text-sm text-neutral-500">
                    <span>8 stories</span>
                    <span>•</span>
                    <span>34 photos</span>
                    <span>•</span>
                    <span>15 contributors</span>
                  </div>
                </div>
              </Card>

              {/* Create New Card */}
              <Card 
                className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer group border-2 border-dashed border-neutral-300 hover:border-[rgb(var(--theme-primary))] bg-neutral-50 hover:bg-white"
                onClick={() => onNavigate('story')}
              >
                <div className="aspect-[4/3] flex items-center justify-center bg-gradient-to-br from-[rgb(var(--theme-gradient-from))] to-[rgb(var(--theme-gradient-to))]">
                  <div className="text-center space-y-3">
                    <div className="size-16 rounded-full bg-white/80 flex items-center justify-center mx-auto">
                      <Plus className="size-8 text-[rgb(var(--theme-primary))]" />
                    </div>
                    <p className="text-neutral-700">Create New Legacy</p>
                  </div>
                </div>
                <div className="p-5 space-y-3">
                  <h3 className="text-neutral-900 text-center">Start a New Tribute</h3>
                  <p className="text-sm text-neutral-600 text-center">
                    Honor someone special with a digital legacy
                  </p>
                </div>
              </Card>
            </div>
          </div>
        </section>
      )}

      {/* Example Legacies */}
      <section className="bg-white py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center space-y-3 mb-12">
            <h2 className="text-neutral-900">Explore Legacies</h2>
            <p className="text-neutral-600 max-w-2xl mx-auto">
              See how people are creating meaningful tributes for every occasion
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {legacies.map((legacy) => (
              <Card 
                key={legacy.id}
                className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer group"
                onClick={() => onSelectLegacy(legacy.id)}
              >
                <div className="aspect-[4/3] overflow-hidden bg-neutral-100">
                  <img 
                    src={legacy.imageUrl} 
                    alt={legacy.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
                <div className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1 flex-1">
                      <h3 className="text-neutral-900">{legacy.name}</h3>
                      <p className="text-sm text-neutral-500">{legacy.dates}</p>
                    </div>
                    <Badge variant="outline" className={contextColors[legacy.context]}>
                      {contextLabels[legacy.context]}
                    </Badge>
                  </div>
                  
                  <p className="text-sm text-neutral-600 line-clamp-2">
                    {legacy.tagline}
                  </p>

                  <p className="text-sm text-neutral-500 line-clamp-3 leading-relaxed">
                    {legacy.preview}
                  </p>

                  <div className="flex items-center gap-4 pt-2 text-sm text-neutral-500">
                    <span>{legacy.storyCount} stories</span>
                    <span>•</span>
                    <span>{legacy.photoCount} photos</span>
                    <span>•</span>
                    <span>{legacy.contributorCount} contributors</span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="max-w-4xl mx-auto px-6">
          <Card className="bg-gradient-to-br from-[rgb(var(--theme-gradient-from))] to-[rgb(var(--theme-gradient-to))] border border-[rgb(var(--theme-accent))] p-12 text-center">
            <div className="space-y-6">
              <h2 className="text-neutral-900">Start creating today</h2>
              <p className="text-neutral-600 max-w-xl mx-auto">
                Whether you're honoring a loved one, celebrating a milestone, or preserving memories for the future, Mosaic Life helps you tell the story that matters.
              </p>
              <Button 
                size="lg" 
                className="gap-2"
                onClick={user ? () => onNavigate('story') : onAuthClick}
              >
                Create Your First Legacy
                <ArrowRight className="size-4" />
              </Button>
            </div>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <Footer onNavigate={onNavigate} />
    </div>
  );
}