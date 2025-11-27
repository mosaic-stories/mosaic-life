import { ArrowLeft, Edit, Share2, Plus, Image as ImageIcon, MessageSquare, Sparkles, Users } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import ThemeSelector from './ThemeSelector';
import UserProfileDropdown from './UserProfileDropdown';
import { legacies } from '../lib/mockData';

interface LegacyProfileMinimalProps {
  legacyId: string;
  onNavigate: (view: string) => void;
  currentTheme: string;
  onThemeChange: (theme: string) => void;
  user: { name: string; email: string; avatarUrl?: string } | null;
  onAuthClick: () => void;
  onSignOut: () => void;
}

export default function LegacyProfileMinimal({
  legacyId,
  onNavigate,
  currentTheme,
  onThemeChange,
  user,
  onAuthClick,
  onSignOut
}: LegacyProfileMinimalProps) {
  const legacy = legacies.find(l => l.id === legacyId) || legacies[0];

  return (
    <div className="min-h-screen bg-gradient-to-br from-white to-[rgb(var(--theme-bg))]">
      {/* Navigation */}
      <nav className="border-b bg-white/90 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <button 
            onClick={() => onNavigate('home-minimal')}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <ArrowLeft className="size-5" />
            <span className="text-sm">Back</span>
          </button>
          
          <div className="flex items-center gap-4">
            <button
              onClick={() => onNavigate('profile')}
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
      <div className="max-w-5xl mx-auto px-6 py-12">
        {/* Profile Header */}
        <div className="bg-white rounded-2xl p-8 border border-[rgb(var(--theme-border))] mb-8">
          <div className="flex items-start gap-6">
            <img 
              src={legacy.profileImage}
              alt={legacy.name}
              className="size-24 rounded-xl object-cover"
            />
            <div className="flex-1">
              <h1 className="text-neutral-900 mb-2">{legacy.name}</h1>
              <p className="text-neutral-600 mb-3">{legacy.dates}</p>
              {legacy.tagline && (
                <p className="text-neutral-700 mb-4">{legacy.tagline}</p>
              )}
              <div className="flex items-center gap-3">
                <Button 
                  size="sm"
                  onClick={() => onNavigate('story-minimal')}
                  className="bg-[rgb(var(--theme-primary))] hover:bg-[rgb(var(--theme-primary-dark))] text-white gap-2"
                >
                  <Plus className="size-4" />
                  Add Story
                </Button>
                <Button size="sm" variant="outline" className="gap-2">
                  <Share2 className="size-4" />
                  Share
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-8">
          <button className="px-4 py-2 rounded-lg bg-[rgb(var(--theme-primary))] text-white">
            Stories
          </button>
          <button 
            onClick={() => onNavigate('gallery-minimal')}
            className="px-4 py-2 rounded-lg border border-[rgb(var(--theme-border))] hover:border-[rgb(var(--theme-primary))] transition-colors"
          >
            Gallery
          </button>
          <button 
            onClick={() => onNavigate('ai-chat-minimal')}
            className="px-4 py-2 rounded-lg border border-[rgb(var(--theme-border))] hover:border-[rgb(var(--theme-primary))] transition-colors gap-2 flex items-center"
          >
            <Sparkles className="size-4" />
            AI Chat
          </button>
        </div>

        {/* Stories */}
        <div className="space-y-6">
          {(legacy.stories || []).map((story, index) => (
            <div 
              key={index}
              className="bg-white rounded-2xl p-6 border border-[rgb(var(--theme-border))] hover:border-[rgb(var(--theme-primary))] transition-colors"
            >
              {/* Author */}
              <div className="flex items-center gap-3 mb-4">
                <div className="size-10 rounded-full bg-[rgb(var(--theme-bg))] flex items-center justify-center">
                  <span className="text-sm">{story.author[0]}</span>
                </div>
                <div className="flex-1">
                  <p className="text-sm text-neutral-900">{story.author}</p>
                  <p className="text-xs text-neutral-500">{story.date}</p>
                </div>
                {story.category && (
                  <Badge variant="outline" className="text-xs">
                    {story.category}
                  </Badge>
                )}
              </div>

              {/* Title */}
              {story.title && (
                <h3 className="text-neutral-900 mb-3">{story.title}</h3>
              )}

              {/* Content */}
              <p className="text-neutral-600 leading-relaxed">
                {story.content}
              </p>
            </div>
          ))}

          {/* Add Story Prompt */}
          <button
            onClick={() => onNavigate('story-minimal')}
            className="w-full bg-white border-2 border-dashed border-[rgb(var(--theme-border))] rounded-2xl p-8 hover:border-[rgb(var(--theme-primary))] transition-all group"
          >
            <div className="flex flex-col items-center gap-3">
              <div className="size-12 rounded-full bg-[rgb(var(--theme-bg))] flex items-center justify-center group-hover:bg-[rgb(var(--theme-primary))] transition-colors">
                <Plus className="size-6 text-[rgb(var(--theme-primary))] group-hover:text-white transition-colors" />
              </div>
              <p className="text-neutral-600">Share a memory</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}