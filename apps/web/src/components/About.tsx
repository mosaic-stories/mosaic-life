import { ArrowLeft, BookHeart, Users, Shield, Heart, Sparkles, ArrowRight, Mail } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import ThemeSelector from './ThemeSelector';
import UserProfileDropdown from './UserProfileDropdown';
import Footer from './Footer';
import SearchBar from './SearchBar';

interface AboutProps {
  onNavigate: (view: string) => void;
  onSelectLegacy?: (legacyId: string) => void;
  currentTheme: string;
  onThemeChange: (themeId: string) => void;
  user: { name: string; email: string; avatarUrl?: string } | null;
  onAuthClick: () => void;
  onSignOut: () => void;
}

export default function About({ onNavigate, onSelectLegacy, currentTheme, onThemeChange, user, onAuthClick, onSignOut }: AboutProps) {
  const handleSearchSelect = (type: string, id: string) => {
    if (type === 'legacy' && onSelectLegacy) {
      onSelectLegacy(id);
    } else if (type === 'community') {
      onNavigate('community');
    } else if (type === 'story' && onSelectLegacy) {
      onSelectLegacy(id);
    }
  };

  return (
    <div className="min-h-screen bg-[rgb(var(--theme-background))] transition-colors duration-300 flex flex-col">
      {/* Header */}
      <header className="bg-white/90 backdrop-blur-sm border-b sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <button 
              onClick={() => onNavigate('home')}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity flex-shrink-0"
            >
              <BookHeart className="size-6 text-[rgb(var(--theme-primary))]" />
              <span className="tracking-tight text-neutral-900">Mosaic Life</span>
            </button>

            <div className="flex-1 max-w-md hidden md:block">
              <SearchBar onSelectResult={handleSearchSelect} compact />
            </div>
            
            <div className="flex items-center gap-6 flex-shrink-0">
              <nav className="hidden md:flex items-center gap-4">
                <button 
                  onClick={() => onNavigate('home')}
                  className="text-neutral-600 hover:text-neutral-900 transition-colors"
                >
                  Home
                </button>
                <button 
                  onClick={() => onNavigate('about')}
                  className="text-neutral-900"
                >
                  About
                </button>
                <button 
                  onClick={() => onNavigate('how-it-works')}
                  className="text-neutral-600 hover:text-neutral-900 transition-colors"
                >
                  How It Works
                </button>
                <button 
                  onClick={() => onNavigate('community')}
                  className="text-neutral-600 hover:text-neutral-900 transition-colors"
                >
                  Community
                </button>
              </nav>
              <div className="flex items-center gap-3">
                <ThemeSelector currentTheme={currentTheme} onThemeChange={onThemeChange} />
                {user ? (
                  <UserProfileDropdown user={user} onNavigate={onNavigate} onSignOut={onSignOut} />
                ) : (
                  <Button size="sm" onClick={onAuthClick}>Sign In</Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="max-w-4xl mx-auto px-6 py-20">
          <div className="text-center space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[rgb(var(--theme-accent-light))] border border-[rgb(var(--theme-accent))]">
              <Heart className="size-4 text-[rgb(var(--theme-primary))]" />
              <span className="text-sm text-[rgb(var(--theme-primary-dark))]">Our Story</span>
            </div>
            
            <h1 className="text-neutral-900">
              Every life is a mosaic of stories
            </h1>
            
            <p className="text-neutral-600 max-w-2xl mx-auto text-lg leading-relaxed">
              Mosaic Life was born from a deeply personal experience: the loss of a loved one and the realization 
              that we had missed the chance to capture the fullness of their story. The memories, the wisdom, 
              the little moments that made them who they were—so much was scattered across different people's minds, 
              waiting to fade with time.
            </p>
          </div>
        </section>

        {/* Mission Section */}
        <section className="bg-white py-20">
          <div className="max-w-7xl mx-auto px-6">
            <div className="max-w-3xl mx-auto space-y-12">
              <div className="text-center space-y-4">
                <h2 className="text-neutral-900">Our Mission</h2>
                <p className="text-neutral-600 text-lg">
                  We believe that every person's story deserves to be told, remembered, and celebrated—not just 
                  after they're gone, but throughout the meaningful moments of their lives.
                </p>
              </div>

              <div className="space-y-6">
                <p className="text-neutral-700 leading-relaxed">
                  Whether it's honoring someone who has passed, celebrating a retirement, preserving memories 
                  for someone with dementia, commemorating a graduation, or simply creating a living tribute 
                  to someone special, Mosaic Life provides a space where stories can be gathered, preserved, 
                  and shared.
                </p>
                <p className="text-neutral-700 leading-relaxed">
                  We've seen firsthand how powerful it is when multiple people contribute their perspectives—how 
                  a colleague's memory of a mentor might reveal qualities a family never knew, or how a grandchild's 
                  story brings new dimension to someone a spouse thought they knew completely.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* The Mosaic Metaphor */}
        <section className="py-20">
          <div className="max-w-7xl mx-auto px-6">
            <div className="max-w-4xl mx-auto">
              <Card className="p-12 bg-gradient-to-br from-[rgb(var(--theme-gradient-from))] to-[rgb(var(--theme-gradient-to))] border-[rgb(var(--theme-accent))]">
                <div className="space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="size-12 rounded-full bg-white/80 flex items-center justify-center">
                      <Users className="size-6 text-[rgb(var(--theme-primary))]" />
                    </div>
                    <h2 className="text-neutral-900">The Mosaic</h2>
                  </div>
                  <p className="text-neutral-700 text-lg leading-relaxed">
                    Like tiles in a mosaic, each person sees a different facet of someone's life. A parent, 
                    a friend, a colleague, a student—each holds unique pieces of the picture. When these 
                    perspectives come together, they create something far richer and more complete than any 
                    single viewpoint could capture.
                  </p>
                  <p className="text-neutral-700 text-lg leading-relaxed">
                    That's what Mosaic Life does: it brings together all these individual pieces into a 
                    beautiful, comprehensive portrait of a person's legacy.
                  </p>
                </div>
              </Card>
            </div>
          </div>
        </section>

        {/* AI & Technology */}
        <section className="bg-white py-20">
          <div className="max-w-7xl mx-auto px-6">
            <div className="max-w-3xl mx-auto space-y-8">
              <div className="text-center space-y-4">
                <div className="flex items-center justify-center gap-2">
                  <Sparkles className="size-6 text-[rgb(var(--theme-primary))]" />
                  <h2 className="text-neutral-900">Technology That Enhances, Never Replaces</h2>
                </div>
                <p className="text-neutral-600 text-lg">
                  Our AI agents are designed to be helpful companions in your storytelling journey—not replacements 
                  for human connection.
                </p>
              </div>

              <div className="space-y-6">
                <p className="text-neutral-700 leading-relaxed">
                  They can help prompt memories you might have forgotten, suggest questions that draw out deeper 
                  stories, organize contributions from multiple people, and even help those who find writing 
                  difficult to express their thoughts clearly. But the heart of every Legacy on Mosaic Life is 
                  always the authentic human stories shared by real people.
                </p>
                <p className="text-neutral-700 leading-relaxed">
                  AI is a tool that makes storytelling more accessible, not a shortcut that diminishes its meaning.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Values */}
        <section className="py-20">
          <div className="max-w-7xl mx-auto px-6">
            <div className="max-w-4xl mx-auto space-y-12">
              <div className="text-center">
                <h2 className="text-neutral-900">What We Stand For</h2>
              </div>

              <div className="grid md:grid-cols-3 gap-6">
                <Card className="p-6 space-y-4">
                  <div className="size-12 rounded-lg bg-[rgb(var(--theme-accent-light))] flex items-center justify-center">
                    <Shield className="size-6 text-[rgb(var(--theme-primary))]" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-neutral-900">Privacy & Security</h3>
                    <p className="text-sm text-neutral-600 leading-relaxed">
                      Your stories are precious. We treat them with the respect they deserve, giving you full 
                      control over who sees what and ensuring your data is protected.
                    </p>
                  </div>
                </Card>

                <Card className="p-6 space-y-4">
                  <div className="size-12 rounded-lg bg-[rgb(var(--theme-accent-light))] flex items-center justify-center">
                    <Users className="size-6 text-[rgb(var(--theme-primary))]" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-neutral-900">User Control</h3>
                    <p className="text-sm text-neutral-600 leading-relaxed">
                      You decide who contributes, what gets shared, and how your Legacy is presented. This is 
                      your story to tell, and we're just here to help.
                    </p>
                  </div>
                </Card>

                <Card className="p-6 space-y-4">
                  <div className="size-12 rounded-lg bg-[rgb(var(--theme-accent-light))] flex items-center justify-center">
                    <Heart className="size-6 text-[rgb(var(--theme-primary))]" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-neutral-900">Respectful Preservation</h3>
                    <p className="text-sm text-neutral-600 leading-relaxed">
                      We understand the sensitivity of these moments. Whether celebrating or mourning, every 
                      feature is designed with dignity and respect at its core.
                    </p>
                  </div>
                </Card>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="bg-white py-20">
          <div className="max-w-4xl mx-auto px-6">
            <Card className="bg-gradient-to-br from-[rgb(var(--theme-gradient-from))] to-[rgb(var(--theme-gradient-to))] border border-[rgb(var(--theme-accent))] p-12 text-center">
              <div className="space-y-6">
                <h2 className="text-neutral-900">Start Creating a Legacy</h2>
                <p className="text-neutral-600 max-w-xl mx-auto">
                  Every person's story deserves to be told. Start preserving the memories that matter most.
                </p>
                <Button 
                  size="lg" 
                  className="gap-2 bg-[rgb(var(--theme-primary))] hover:bg-[rgb(var(--theme-primary-dark))]"
                  onClick={user ? () => onNavigate('story') : onAuthClick}
                >
                  Create Your First Legacy
                  <ArrowRight className="size-4" />
                </Button>
              </div>
            </Card>
          </div>
        </section>

        {/* Contact Section */}
        <section className="py-20">
          <div className="max-w-3xl mx-auto px-6">
            <div className="text-center space-y-6">
              <h2 className="text-neutral-900">Get in Touch</h2>
              <p className="text-neutral-600">
                Have questions, feedback, or need support? We're here to help.
              </p>
              <a
                href="mailto:support@mosaiclife.me"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-neutral-100 hover:bg-neutral-200 transition-colors text-neutral-900"
              >
                <Mail className="size-5" />
                support@mosaiclife.me
              </a>
            </div>
          </div>
        </section>
      </main>

      <Footer onNavigate={onNavigate} />
    </div>
  );
}