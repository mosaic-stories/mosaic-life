import { useState } from 'react';
import { ArrowLeft, Calendar, Heart, Image, Lock, MessageSquare, MoreVertical, Plus, Share2, Sparkles, Users } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { legacies, stories, mediaItems } from '../lib/mockData';
import { getThemeClasses } from '../lib/themes';
import ThemeSelector from './ThemeSelector';

interface LegacyProfileProps {
  legacyId: string;
  onNavigate: (view: string) => void;
  currentTheme: string;
  onThemeChange: (themeId: string) => void;
}

export default function LegacyProfile({ legacyId, onNavigate, currentTheme, onThemeChange }: LegacyProfileProps) {
  const [activeSection, setActiveSection] = useState<'stories' | 'media' | 'ai'>('stories');
  const legacy = legacies.find(l => l.id === legacyId) || legacies[0];
  const theme = getThemeClasses(currentTheme);

  return (
    <div className="min-h-screen bg-[rgb(var(--theme-background))] transition-colors duration-300">
      {/* Header */}
      <header className="bg-white/90 backdrop-blur-sm border-b sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <button 
              onClick={() => onNavigate('home')}
              className="flex items-center gap-2 text-neutral-600 hover:text-neutral-900 transition-colors"
            >
              <ArrowLeft className="size-4" />
              <span>Back to home</span>
            </button>
            <div className="flex items-center gap-3">
              <ThemeSelector currentTheme={currentTheme} onThemeChange={onThemeChange} />
              <Button variant="ghost" size="sm">
                <Share2 className="size-4" />
              </Button>
              <Button variant="ghost" size="sm">
                <MoreVertical className="size-4" />
              </Button>
              <Button size="sm" onClick={() => onNavigate('story')} className="bg-[rgb(var(--theme-primary))] hover:bg-[rgb(var(--theme-primary-dark))]">
                <Plus className="size-4 mr-2" />
                Add Story
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Profile Header */}
      <section className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <div className="flex items-start gap-8">
            <div className="size-32 rounded-2xl overflow-hidden bg-neutral-100 flex-shrink-0">
              <img 
                src={legacy.imageUrl}
                alt={legacy.name}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex-1 space-y-4">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <h1 className="text-neutral-900">{legacy.name}</h1>
                  <Badge variant="outline" className="bg-[rgb(var(--theme-accent-light))] text-[rgb(var(--theme-primary-dark))] border-[rgb(var(--theme-accent))]">
                    <Lock className="size-3 mr-1" />
                    Private
                  </Badge>
                </div>
                <p className="text-neutral-600">{legacy.dates}</p>
                <p className="text-neutral-700 max-w-2xl">{legacy.tagline}</p>
              </div>

              <div className="flex items-center gap-6 text-sm">
                <div className="flex items-center gap-2 text-neutral-600">
                  <MessageSquare className="size-4" />
                  <span>{legacy.storyCount} stories</span>
                </div>
                <div className="flex items-center gap-2 text-neutral-600">
                  <Image className="size-4" />
                  <span>{legacy.photoCount} photos</span>
                </div>
                <div className="flex items-center gap-2 text-neutral-600">
                  <Users className="size-4" />
                  <span>{legacy.contributorCount} contributors</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section Navigation */}
      <nav className="bg-white/90 backdrop-blur-sm border-b sticky top-[73px] z-30">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-8">
            <button
              onClick={() => setActiveSection('stories')}
              className={`py-4 border-b-2 transition-colors ${
                activeSection === 'stories'
                  ? 'border-[rgb(var(--theme-primary))] text-neutral-900'
                  : 'border-transparent text-neutral-500 hover:text-neutral-900'
              }`}
            >
              Stories
            </button>
            <button
              onClick={() => setActiveSection('media')}
              className={`py-4 border-b-2 transition-colors ${
                activeSection === 'media'
                  ? 'border-[rgb(var(--theme-primary))] text-neutral-900'
                  : 'border-transparent text-neutral-500 hover:text-neutral-900'
              }`}
            >
              Media Gallery
            </button>
            <button
              onClick={() => setActiveSection('ai')}
              className={`py-4 border-b-2 transition-colors flex items-center gap-2 ${
                activeSection === 'ai'
                  ? 'border-[rgb(var(--theme-primary))] text-neutral-900'
                  : 'border-transparent text-neutral-500 hover:text-neutral-900'
              }`}
            >
              <Sparkles className="size-4" />
              AI Interactions
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-12">
        {activeSection === 'stories' && (
          <div className="max-w-3xl space-y-6">
            {stories.map((story) => (
              <Card key={story.id} className="p-8 space-y-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <h3 className="text-neutral-900">{story.title}</h3>
                    <div className="flex items-center gap-3 text-sm text-neutral-500">
                      <div className="flex items-center gap-2">
                        <Avatar className="size-6">
                          <AvatarFallback className="text-xs">
                            {story.author.split(' ').map(n => n[0]).join('')}
                          </AvatarFallback>
                        </Avatar>
                        <span>{story.author}</span>
                      </div>
                      <span>•</span>
                      <div className="flex items-center gap-1">
                        <Calendar className="size-3" />
                        <span>{story.date}</span>
                      </div>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm">
                    <Heart className="size-4" />
                  </Button>
                </div>

                {story.mediaUrl && (
                  <div className="rounded-lg overflow-hidden bg-neutral-100 aspect-video">
                    <img 
                      src={story.mediaUrl}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}

                <p className="text-neutral-700 leading-relaxed">{story.content}</p>
              </Card>
            ))}

            <Card className="p-8 border-dashed hover:border-[rgb(var(--theme-accent))] hover:bg-[rgb(var(--theme-accent-light))]/30 transition-colors cursor-pointer">
              <div className="text-center space-y-3">
                <div className="size-12 rounded-full bg-[rgb(var(--theme-accent-light))] flex items-center justify-center mx-auto">
                  <Plus className="size-6 text-[rgb(var(--theme-primary))]" />
                </div>
                <div>
                  <p className="text-neutral-900">Add a new story</p>
                  <p className="text-sm text-neutral-500">Share a memory or moment</p>
                </div>
              </div>
            </Card>
          </div>
        )}

        {activeSection === 'media' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-neutral-900">Photo Gallery</h2>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => onNavigate('gallery')}
              >
                View Full Gallery
              </Button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {mediaItems.map((item) => (
                <div 
                  key={item.id}
                  className="aspect-square rounded-lg overflow-hidden bg-neutral-100 group cursor-pointer"
                >
                  <img 
                    src={item.url}
                    alt={item.caption}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                  />
                </div>
              ))}
              <button className="aspect-square rounded-lg border-2 border-dashed border-neutral-300 hover:border-[rgb(var(--theme-accent))] hover:bg-[rgb(var(--theme-accent-light))]/30 transition-colors flex items-center justify-center">
                <div className="text-center space-y-2">
                  <div className="size-10 rounded-full bg-neutral-100 flex items-center justify-center mx-auto">
                    <Plus className="size-5 text-neutral-600" />
                  </div>
                  <p className="text-sm text-neutral-600">Add photos</p>
                </div>
              </button>
            </div>
          </div>
        )}

        {activeSection === 'ai' && (
          <div className="max-w-3xl space-y-6">
            <Card className="p-8 space-y-4 bg-gradient-to-br from-[rgb(var(--theme-gradient-from))] to-[rgb(var(--theme-gradient-to))] border-[rgb(var(--theme-accent))]">
              <div className="flex items-start gap-4">
                <div className="size-12 rounded-full bg-[rgb(var(--theme-primary))] flex items-center justify-center flex-shrink-0">
                  <Sparkles className="size-6 text-white" />
                </div>
                <div className="space-y-2 flex-1">
                  <h3 className="text-neutral-900">AI-Powered Interactions</h3>
                  <p className="text-neutral-600">
                    Explore different ways to interact with and preserve Margaret's legacy through AI assistants
                  </p>
                </div>
              </div>
            </Card>

            <div className="grid md:grid-cols-2 gap-4">
              <Card 
                className="p-6 space-y-4 cursor-pointer hover:shadow-lg transition-shadow group"
                onClick={() => onNavigate('ai-chat')}
              >
                <div className="flex items-start justify-between">
                  <div className="size-12 rounded-lg bg-blue-100 flex items-center justify-center">
                    <MessageSquare className="size-6 text-blue-600" />
                  </div>
                  <ArrowLeft className="size-4 text-neutral-400 group-hover:text-neutral-900 transition-colors rotate-180" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-neutral-900">Chat Interface</h3>
                  <p className="text-sm text-neutral-600">
                    Conversational AI agents that help you explore stories, ask questions, and preserve memories
                  </p>
                </div>
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                  Interactive
                </Badge>
              </Card>

              <Card 
                className="p-6 space-y-4 cursor-pointer hover:shadow-lg transition-shadow group"
                onClick={() => onNavigate('ai-panel')}
              >
                <div className="flex items-start justify-between">
                  <div className="size-12 rounded-lg bg-purple-100 flex items-center justify-center">
                    <Users className="size-6 text-purple-600" />
                  </div>
                  <ArrowLeft className="size-4 text-neutral-400 group-hover:text-neutral-900 transition-colors rotate-180" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-neutral-900">Agent Panel</h3>
                  <p className="text-sm text-neutral-600">
                    Browse and select from specialized AI agents, each with unique perspectives and expertise
                  </p>
                </div>
                <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                  Curated
                </Badge>
              </Card>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}