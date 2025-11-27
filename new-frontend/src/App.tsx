import { useState, useEffect } from 'react';
import Homepage from './components/Homepage';
import HomePageMinimal from './components/HomePageMinimal';
import AboutMinimal from './components/AboutMinimal';
import HowItWorksMinimal from './components/HowItWorksMinimal';
import MyLegaciesMinimal from './components/MyLegaciesMinimal';
import LegacyProfileMinimal from './components/LegacyProfileMinimal';
import StoryCreationMinimal from './components/StoryCreationMinimal';
import ExploreMinimal from './components/ExploreMinimal';
import CommunityMinimal from './components/CommunityMinimal';
import AIAgentChatMinimal from './components/AIAgentChatMinimal';
import LegacyProfile from './components/LegacyProfile';
import StoryCreation from './components/StoryCreation';
import MediaGallery from './components/MediaGallery';
import AIAgentChat from './components/AIAgentChat';
import AIAgentPanel from './components/AIAgentPanel';
import AuthModal from './components/AuthModal';
import MyLegacies from './components/MyLegacies';
import About from './components/About';
import HowItWorks from './components/HowItWorks';
import Community from './components/Community';
import { applyTheme } from './lib/themeUtils';

type View = 'home' | 'profile' | 'story' | 'gallery' | 'ai-chat' | 'ai-panel' | 'my-profile' | 'my-legacies' | 'my-stories' | 'connected-legacies' | 'settings' | 'help' | 'about' | 'contact' | 'privacy' | 'terms' | 'how-it-works' | 'community' | 'home-minimal' | 'about-minimal' | 'how-it-works-minimal' | 'my-legacies-minimal' | 'profile-minimal' | 'story-minimal' | 'explore-minimal' | 'community-minimal' | 'ai-chat-minimal' | 'gallery-minimal' | 'create-legacy-minimal';

interface User {
  name: string;
  email: string;
  avatarUrl?: string;
}

export default function App() {
  const [currentView, setCurrentView] = useState<View>('home');
  const [selectedLegacyId, setSelectedLegacyId] = useState<string>('1');
  const [currentTheme, setCurrentTheme] = useState<string>('warm-amber');
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isMinimalMode, setIsMinimalMode] = useState(false);

  // Apply theme when it changes and on initial load
  useEffect(() => {
    applyTheme(currentTheme);
  }, [currentTheme]);
  
  // Apply initial theme and set document title
  useEffect(() => {
    applyTheme('warm-amber');
    document.title = 'Mosaic Life - Honoring lives through shared stories';
  }, []);

  const handleAuthenticate = (provider: string) => {
    // Mock authentication - in production this would handle real OAuth
    const mockUser: User = {
      name: 'Sarah Johnson',
      email: 'sarah.johnson@example.com',
      avatarUrl: undefined
    };
    setUser(mockUser);
    setIsAuthModalOpen(false);
  };

  const handleSignOut = () => {
    setUser(null);
    setCurrentView('home');
  };

  const navigateToProfile = (legacyId: string) => {
    setSelectedLegacyId(legacyId);
    setCurrentView('profile');
  };

  const handleNavigate = (view: string) => {
    setCurrentView(view as View);
  };

  const renderView = () => {
    switch (currentView) {
      case 'home':
        return (
          <Homepage 
            onNavigate={handleNavigate} 
            onSelectLegacy={navigateToProfile} 
            currentTheme={currentTheme} 
            onThemeChange={setCurrentTheme}
            user={user}
            onAuthClick={() => setIsAuthModalOpen(true)}
            onSignOut={handleSignOut}
          />
        );
      case 'home-minimal':
        return (
          <HomePageMinimal 
            onNavigate={handleNavigate} 
            onSelectLegacy={navigateToProfile} 
            currentTheme={currentTheme} 
            onThemeChange={setCurrentTheme}
            user={user}
            onAuthClick={() => setIsAuthModalOpen(true)}
            onSignOut={handleSignOut}
          />
        );
      case 'profile':
        return <LegacyProfile legacyId={selectedLegacyId} onNavigate={handleNavigate} currentTheme={currentTheme} onThemeChange={setCurrentTheme} />;
      case 'story':
        return <StoryCreation onNavigate={handleNavigate} legacyId={selectedLegacyId} currentTheme={currentTheme} onThemeChange={setCurrentTheme} />;
      case 'gallery':
        return <MediaGallery onNavigate={handleNavigate} legacyId={selectedLegacyId} currentTheme={currentTheme} onThemeChange={setCurrentTheme} />;
      case 'ai-chat':
        return <AIAgentChat onNavigate={handleNavigate} legacyId={selectedLegacyId} currentTheme={currentTheme} onThemeChange={setCurrentTheme} />;
      case 'ai-panel':
        return <AIAgentPanel onNavigate={handleNavigate} legacyId={selectedLegacyId} currentTheme={currentTheme} onThemeChange={setCurrentTheme} />;
      case 'my-legacies':
        return <MyLegacies onNavigate={handleNavigate} currentTheme={currentTheme} onThemeChange={setCurrentTheme} />;
      case 'my-profile':
      case 'my-stories':
      case 'connected-legacies':
      case 'settings':
      case 'help':
        // Placeholder views - redirect to home for now
        return (
          <Homepage 
            onNavigate={handleNavigate} 
            onSelectLegacy={navigateToProfile} 
            currentTheme={currentTheme} 
            onThemeChange={setCurrentTheme}
            user={user}
            onAuthClick={() => setIsAuthModalOpen(true)}
            onSignOut={handleSignOut}
          />
        );
      case 'about':
        return <About onNavigate={handleNavigate} onSelectLegacy={navigateToProfile} currentTheme={currentTheme} onThemeChange={setCurrentTheme} user={user} onAuthClick={() => setIsAuthModalOpen(true)} onSignOut={handleSignOut} />;
      case 'about-minimal':
        return <AboutMinimal onNavigate={handleNavigate} onSelectLegacy={navigateToProfile} currentTheme={currentTheme} onThemeChange={setCurrentTheme} user={user} onAuthClick={() => setIsAuthModalOpen(true)} onSignOut={handleSignOut} />;
      case 'how-it-works':
        return <HowItWorks onNavigate={handleNavigate} onSelectLegacy={navigateToProfile} currentTheme={currentTheme} onThemeChange={setCurrentTheme} user={user} onAuthClick={() => setIsAuthModalOpen(true)} onSignOut={handleSignOut} />;
      case 'how-it-works-minimal':
        return <HowItWorksMinimal onNavigate={handleNavigate} onSelectLegacy={navigateToProfile} currentTheme={currentTheme} onThemeChange={setCurrentTheme} user={user} onAuthClick={() => setIsAuthModalOpen(true)} onSignOut={handleSignOut} />;
      case 'my-legacies-minimal':
        return <MyLegaciesMinimal onNavigate={handleNavigate} onSelectLegacy={navigateToProfile} currentTheme={currentTheme} onThemeChange={setCurrentTheme} user={user} onAuthClick={() => setIsAuthModalOpen(true)} onSignOut={handleSignOut} />;
      case 'profile-minimal':
        return <LegacyProfileMinimal legacyId={selectedLegacyId} onNavigate={handleNavigate} currentTheme={currentTheme} onThemeChange={setCurrentTheme} user={user} onAuthClick={() => setIsAuthModalOpen(true)} onSignOut={handleSignOut} />;
      case 'story-minimal':
        return <StoryCreationMinimal onNavigate={handleNavigate} legacyId={selectedLegacyId} currentTheme={currentTheme} onThemeChange={setCurrentTheme} user={user} onAuthClick={() => setIsAuthModalOpen(true)} onSignOut={handleSignOut} />;
      case 'explore-minimal':
        return <ExploreMinimal onNavigate={handleNavigate} onSelectLegacy={navigateToProfile} currentTheme={currentTheme} onThemeChange={setCurrentTheme} user={user} onAuthClick={() => setIsAuthModalOpen(true)} onSignOut={handleSignOut} />;
      case 'community-minimal':
        return <CommunityMinimal onNavigate={handleNavigate} onSelectLegacy={navigateToProfile} currentTheme={currentTheme} onThemeChange={setCurrentTheme} user={user} onAuthClick={() => setIsAuthModalOpen(true)} onSignOut={handleSignOut} />;
      case 'ai-chat-minimal':
        return <AIAgentChatMinimal onNavigate={handleNavigate} legacyId={selectedLegacyId} currentTheme={currentTheme} onThemeChange={setCurrentTheme} user={user} onAuthClick={() => setIsAuthModalOpen(true)} onSignOut={handleSignOut} />;
      case 'community':
        return <Community onNavigate={handleNavigate} onSelectLegacy={navigateToProfile} currentTheme={currentTheme} onThemeChange={setCurrentTheme} user={user} onAuthClick={() => setIsAuthModalOpen(true)} onSignOut={handleSignOut} />;
      default:
        return (
          <Homepage 
            onNavigate={handleNavigate} 
            onSelectLegacy={navigateToProfile} 
            currentTheme={currentTheme} 
            onThemeChange={setCurrentTheme}
            user={user}
            onAuthClick={() => setIsAuthModalOpen(true)}
            onSignOut={handleSignOut}
          />
        );
    }
  };

  return (
    <div className="min-h-screen bg-[rgb(var(--theme-background))] transition-colors duration-300">
      {renderView()}
      <AuthModal 
        isOpen={isAuthModalOpen} 
        onClose={() => setIsAuthModalOpen(false)} 
        onAuthenticate={handleAuthenticate} 
      />
    </div>
  );
}