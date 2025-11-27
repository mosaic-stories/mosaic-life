import { Plus, BookHeart, Image, MessageSquare, Users } from 'lucide-react';
import { Button } from './ui/button';
import ThemeSelector from './ThemeSelector';
import UserProfileDropdown from './UserProfileDropdown';
import { legacies } from '../lib/mockData';
import DogearToggle from './DogearToggle';

interface MyLegaciesMinimalProps {
  onNavigate: (view: string) => void;
  onSelectLegacy: (id: string) => void;
  currentTheme: string;
  onThemeChange: (theme: string) => void;
  user: { name: string; email: string; avatarUrl?: string } | null;
  onAuthClick: () => void;
  onSignOut: () => void;
}

export default function MyLegaciesMinimal({
  onNavigate,
  onSelectLegacy,
  currentTheme,
  onThemeChange,
  user,
  onAuthClick,
  onSignOut
}: MyLegaciesMinimalProps) {
  // Mock user's legacies (first 3 from data)
  const myLegacies = legacies.slice(0, 3);

  const handleViewLegacy = (id: string) => {
    onSelectLegacy(id);
    onNavigate('profile-minimal');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-white to-[rgb(var(--theme-bg))]">
      {/* Dogear Toggle */}
      <DogearToggle isSimpleView={true} onToggle={() => onNavigate('my-legacies')} />
      
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
              onClick={() => onNavigate('my-legacies')}
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
      <div className="max-w-5xl mx-auto px-6 py-16">
        {/* Header */}
        <div className="flex items-center justify-between mb-12">
          <div>
            <h1 className="text-neutral-900 mb-2">My Tributes</h1>
            <p className="text-neutral-600">
              {user ? 'Create and manage your tributes' : 'Demo Mode - Explore sample tributes'}
            </p>
          </div>
          <Button 
            onClick={() => user ? onNavigate('create-legacy-minimal') : onAuthClick()}
            className="bg-[rgb(var(--theme-primary))] hover:bg-[rgb(var(--theme-primary-dark))] text-white gap-2"
          >
            <Plus className="size-4" />
            {user ? 'New Tribute' : 'Sign In to Create'}
          </Button>
        </div>

        {/* Legacies Grid */}
        {myLegacies.length > 0 ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {myLegacies.map((legacy) => (
              <button
                key={legacy.id}
                onClick={() => handleViewLegacy(legacy.id)}
                className="bg-white border border-[rgb(var(--theme-border))] rounded-2xl p-6 hover:border-[rgb(var(--theme-primary))] transition-all hover:shadow-lg text-left"
              >
                {/* Image */}
                <div className="aspect-square bg-[rgb(var(--theme-bg))] rounded-xl mb-4 overflow-hidden">
                  <img 
                    src={legacy.profileImage} 
                    alt={legacy.name}
                    className="w-full h-full object-cover"
                  />
                </div>

                {/* Info */}
                <h3 className="text-neutral-900 mb-1">{legacy.name}</h3>
                <p className="text-sm text-neutral-500 mb-4">{legacy.dates}</p>

                {/* Stats */}
                <div className="flex items-center gap-4 text-xs text-neutral-500">
                  <span className="flex items-center gap-1">
                    <MessageSquare className="size-3" />
                    {legacy.stories?.length || 0}
                  </span>
                  <span className="flex items-center gap-1">
                    <Image className="size-3" />
                    {legacy.media?.length || 0}
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="size-3" />
                    {legacy.contributors?.length || 0}
                  </span>
                </div>
              </button>
            ))}

            {/* Create New Card */}
            <button
              onClick={() => onNavigate('create-legacy-minimal')}
              className="bg-white border-2 border-dashed border-[rgb(var(--theme-border))] rounded-2xl p-6 hover:border-[rgb(var(--theme-primary))] transition-all flex flex-col items-center justify-center min-h-[300px] group"
            >
              <div className="size-16 rounded-full bg-[rgb(var(--theme-bg))] flex items-center justify-center mb-4 group-hover:bg-[rgb(var(--theme-primary))] transition-colors">
                <Plus className="size-8 text-[rgb(var(--theme-primary))] group-hover:text-white transition-colors" />
              </div>
              <p className="text-neutral-600">Create New Tribute</p>
            </button>
          </div>
        ) : (
          /* Empty State */
          <div className="text-center py-20">
            <div className="size-20 rounded-full bg-[rgb(var(--theme-bg))] flex items-center justify-center mx-auto mb-6">
              <BookHeart className="size-10 text-[rgb(var(--theme-primary))]" />
            </div>
            <h2 className="text-neutral-900 mb-3">No Tributes Yet</h2>
            <p className="text-neutral-600 mb-8 max-w-md mx-auto">
              Start by creating your first tribute to honor someone special
            </p>
            <Button 
              onClick={() => onNavigate('create-legacy-minimal')}
              className="bg-[rgb(var(--theme-primary))] hover:bg-[rgb(var(--theme-primary-dark))] text-white gap-2"
            >
              <Plus className="size-4" />
              Create First Tribute
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}