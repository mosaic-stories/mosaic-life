import {
  BookHeart,
  Plus,
  Users,
  MessageSquare,
  Sparkles,
  Shield,
  Edit3,
  Camera,
  Bot,
  CheckCircle2,
  ArrowRight,
  MessageCircle,
  Globe,
  Lock,
  Heart,
  Lightbulb
} from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import Footer from './Footer';
import { SEOHead } from './seo';

interface HowItWorksProps {
  onNavigate: (view: string) => void;
  onSelectLegacy?: (legacyId: string) => void;
  currentTheme: string;
  onThemeChange: (themeId: string) => void;
  user: { name: string; email: string; avatarUrl?: string } | null;
  onAuthClick: () => void;
  onSignOut: () => void;
}

export default function HowItWorks({ onNavigate, user, onAuthClick }: HowItWorksProps) {
  const features = [
    {
      icon: BookHeart,
      title: 'Legacy Profiles',
      description: 'Create a beautiful, organized space to honor someone special',
      details: [
        'Personalized profile with photo, bio, and key life details',
        'Organized into three main sections: Stories, Media, and AI Interactions',
        'Customizable privacy settings - public, private, or invite-only',
        'Timeline view showing stories chronologically',
        'Tribute counter showing total contributions from community'
      ],
      color: 'text-amber-600'
    },
    {
      icon: Edit3,
      title: 'Story Creation',
      description: 'Write and preserve meaningful memories with AI assistance',
      details: [
        'Rich text editor with formatting options',
        'Inline AI assistant to help overcome writer\'s block',
        'Suggested prompts to spark deeper memories',
        'Add context (era, location, relationships) to stories',
        'Draft saving - work on stories over multiple sessions',
        'Attach photos and media directly to stories'
      ],
      color: 'text-blue-600'
    },
    {
      icon: Camera,
      title: 'Media Gallery',
      description: 'Organize and display photos, videos, and documents',
      details: [
        'Upload unlimited photos and videos',
        'Automatic organization by date and event',
        'Add captions and context to each item',
        'Create albums for specific life periods or events',
        'Slideshow and grid views',
        'Download originals anytime'
      ],
      color: 'text-purple-600'
    },
    {
      icon: Bot,
      title: 'AI Story Assistant (Chat Mode)',
      description: 'Conversational AI that helps you remember and articulate stories',
      details: [
        'Natural conversation interface for brainstorming',
        'Asks thoughtful follow-up questions',
        'Helps organize scattered memories into coherent stories',
        'Suggests connections between different memories',
        'Can help with writing tone and structure',
        'Export chat to story draft with one click'
      ],
      color: 'text-emerald-600'
    },
    {
      icon: Sparkles,
      title: 'AI Agent Panel',
      description: 'Dedicated workspace for AI-enhanced story development',
      details: [
        'Split-screen view: story editor + AI suggestions',
        'Real-time writing assistance and refinements',
        'Memory prompts based on Legacy context',
        'Tone adjustment (formal, casual, emotional)',
        'Grammar and clarity improvements',
        'Generates story titles and summaries'
      ],
      color: 'text-rose-600'
    },
    {
      icon: Users,
      title: 'Collaborative Contributions',
      description: 'Invite others to add their perspectives and memories',
      details: [
        'Send invitations via email or shareable link',
        'Contributors can add stories, photos, and comments',
        'Activity feed shows recent contributions',
        'Moderate submissions before they go live (optional)',
        'Thank contributors with personalized messages',
        'See who contributed what with attribution'
      ],
      color: 'text-indigo-600'
    }
  ];

  const steps = [
    {
      number: '1',
      title: 'Create a Legacy',
      description: 'Start by creating a profile for the person you want to honor. Add their photo, basic information, and set privacy preferences.',
      icon: Plus
    },
    {
      number: '2',
      title: 'Add Stories & Media',
      description: 'Write your first story using our editor, or upload photos and videos. Use AI assistance if you need help getting started.',
      icon: Edit3
    },
    {
      number: '3',
      title: 'Invite Contributors',
      description: 'Share the Legacy with family, friends, and colleagues who knew this person. Each perspective adds depth to the story.',
      icon: Users
    },
    {
      number: '4',
      title: 'Watch It Grow',
      description: 'As more people contribute their memories and photos, the Legacy becomes a rich, multi-faceted portrait of a life well-lived.',
      icon: Sparkles
    }
  ];

  const useCases = [
    {
      title: 'Memorial Tributes',
      description: 'Honor someone who has passed by gathering memories from everyone who knew them.',
      icon: '🕊️'
    },
    {
      title: 'Retirement Celebrations',
      description: 'Celebrate a career by collecting stories from colleagues, mentors, and mentees.',
      icon: '🎉'
    },
    {
      title: 'Living Tributes',
      description: 'Create a legacy while someone is still with us - perfect for milestone birthdays or anniversaries.',
      icon: '💝'
    },
    {
      title: 'Graduation Honors',
      description: 'Mark educational achievements with memories from teachers, classmates, and family.',
      icon: '🎓'
    },
    {
      title: 'Dementia Care',
      description: 'Preserve memories before they fade, creating a resource for reminiscence therapy.',
      icon: '🧠'
    },
    {
      title: 'Family History',
      description: 'Document family stories and wisdom to pass down through generations.',
      icon: '👨‍👩‍👧‍👦'
    }
  ];

  return (
    <div className="min-h-screen bg-[rgb(var(--theme-background))] transition-colors duration-300 flex flex-col">
      <SEOHead
        title="How It Works"
        description="Discover how Mosaic Life helps you create beautiful digital tributes. Learn about our story creation tools, AI assistance, media galleries, and collaborative features."
        path="/how-it-works"
      />
      <main className="flex-1">
        {/* Hero Section */}
        <section className="max-w-5xl mx-auto px-6 py-16">
          <div className="text-center space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[rgb(var(--theme-accent-light))] border border-[rgb(var(--theme-accent))]">
              <Sparkles className="size-4 text-[rgb(var(--theme-primary))]" />
              <span className="text-sm text-[rgb(var(--theme-primary-dark))]">Platform Overview</span>
            </div>
            
            <h1 className="text-neutral-900">
              How Mosaic Life Works
            </h1>
            
            <p className="text-neutral-600 max-w-2xl mx-auto text-lg leading-relaxed">
              A complete toolkit for creating, collaborating on, and preserving meaningful digital tributes. 
              Here's everything you can do with Mosaic Life.
            </p>
          </div>
        </section>

        {/* Getting Started Steps */}
        <section className="bg-white py-16">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-12">
              <h2 className="text-neutral-900 mb-3">Get Started in 4 Simple Steps</h2>
              <p className="text-neutral-600">Creating a Legacy takes just minutes to start</p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {steps.map((step) => (
                <Card key={step.number} className="p-6 space-y-4 relative">
                  <div className="size-12 rounded-full bg-[rgb(var(--theme-accent-light))] flex items-center justify-center">
                    <step.icon className="size-6 text-[rgb(var(--theme-primary))]" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl text-[rgb(var(--theme-primary))]">{step.number}</span>
                      <h3 className="text-neutral-900">{step.title}</h3>
                    </div>
                    <p className="text-sm text-neutral-600 leading-relaxed">{step.description}</p>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Core Features */}
        <section className="py-16">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-12">
              <h2 className="text-neutral-900 mb-3">Powerful Tools for Storytelling</h2>
              <p className="text-neutral-600">Everything you need to create rich, meaningful tributes</p>
            </div>

            <div className="space-y-8">
              {features.map((feature, index) => (
                <Card key={feature.title} className="p-8 hover:shadow-lg transition-shadow">
                  <div className="flex flex-col md:flex-row gap-6">
                    <div className="flex-shrink-0">
                      <div className="size-16 rounded-xl bg-[rgb(var(--theme-accent-light))] flex items-center justify-center">
                        <feature.icon className={`size-8 ${feature.color}`} />
                      </div>
                    </div>
                    <div className="flex-1 space-y-4">
                      <div className="space-y-2">
                        <div className="flex items-center gap-3">
                          <h3 className="text-neutral-900">{feature.title}</h3>
                          <Badge variant="secondary" className="text-xs">
                            {index === 0 ? 'Core' : index < 3 ? 'Essential' : 'Advanced'}
                          </Badge>
                        </div>
                        <p className="text-neutral-600">{feature.description}</p>
                      </div>
                      <ul className="space-y-2">
                        {feature.details.map((detail) => (
                          <li key={detail} className="flex items-start gap-3 text-sm text-neutral-700">
                            <CheckCircle2 className="size-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                            <span>{detail}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Use Cases */}
        <section className="bg-white py-16">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-12">
              <h2 className="text-neutral-900 mb-3">Perfect For Any Occasion</h2>
              <p className="text-neutral-600">Mosaic Life adapts to honor people at different life moments</p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {useCases.map((useCase) => (
                <Card key={useCase.title} className="p-6 space-y-3 hover:shadow-md transition-shadow">
                  <div className="text-4xl">{useCase.icon}</div>
                  <h3 className="text-neutral-900">{useCase.title}</h3>
                  <p className="text-sm text-neutral-600 leading-relaxed">{useCase.description}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* AI Agents Deep Dive */}
        <section className="py-16">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-12 space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[rgb(var(--theme-accent-light))] border border-[rgb(var(--theme-accent))]">
                <Sparkles className="size-4 text-[rgb(var(--theme-primary))]" />
                <span className="text-sm text-[rgb(var(--theme-primary-dark))]">AI-Powered Assistance</span>
              </div>
              <h2 className="text-neutral-900">Meet Your AI Story Companions</h2>
              <p className="text-neutral-600 max-w-2xl mx-auto">
                Three specialized AI agents designed to help you capture, develop, and refine meaningful stories. 
                Each one serves a different purpose in your storytelling journey.
              </p>
            </div>

            <div className="space-y-8">
              {/* Inline AI Assistant */}
              <Card className="overflow-hidden">
                <div className="bg-gradient-to-r from-blue-50 to-cyan-50 p-6 border-b">
                  <div className="flex items-start gap-4">
                    <div className="size-14 rounded-xl bg-blue-500 flex items-center justify-center flex-shrink-0">
                      <Sparkles className="size-7 text-white" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-neutral-900">Inline AI Assistant</h3>
                        <Badge className="bg-blue-100 text-blue-700 border-blue-200">Quick Help</Badge>
                      </div>
                      <p className="text-neutral-600">
                        Your on-demand writing companion that appears right in the story editor when you need it
                      </p>
                    </div>
                  </div>
                </div>
                <div className="p-6 space-y-6">
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-neutral-900 mb-3 flex items-center gap-2">
                        <span className="size-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm">1</span>
                        What It Does
                      </h4>
                      <p className="text-neutral-700 leading-relaxed">
                        The Inline AI Assistant is perfect for quick help while you're actively writing. It's always 
                        just one click away, appearing as a small popup that won't interrupt your flow. Think of it 
                        as having a helpful friend looking over your shoulder, ready to jump in when you get stuck.
                      </p>
                    </div>

                    <div>
                      <h4 className="text-neutral-900 mb-3 flex items-center gap-2">
                        <span className="size-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm">2</span>
                        Key Capabilities
                      </h4>
                      <div className="grid md:grid-cols-2 gap-3">
                        <div className="flex items-start gap-2">
                          <CheckCircle2 className="size-5 text-blue-500 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm text-neutral-900">Overcome Writer's Block</p>
                            <p className="text-xs text-neutral-600">Get suggestions when you're stuck on how to start or continue</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <CheckCircle2 className="size-5 text-blue-500 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm text-neutral-900">Expand Your Ideas</p>
                            <p className="text-xs text-neutral-600">Turn a brief sentence into a fuller paragraph</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <CheckCircle2 className="size-5 text-blue-500 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm text-neutral-900">Improve Clarity</p>
                            <p className="text-xs text-neutral-600">Refine sentences for better readability and flow</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <CheckCircle2 className="size-5 text-blue-500 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm text-neutral-900">Add Descriptive Details</p>
                            <p className="text-xs text-neutral-600">Enhance stories with sensory details and emotion</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-neutral-900 mb-3 flex items-center gap-2">
                        <span className="size-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm">3</span>
                        Best Used For
                      </h4>
                      <ul className="space-y-2">
                        <li className="flex items-start gap-2 text-sm text-neutral-700">
                          <ArrowRight className="size-4 text-blue-500 flex-shrink-0 mt-0.5" />
                          Quick edits and improvements while actively writing
                        </li>
                        <li className="flex items-start gap-2 text-sm text-neutral-700">
                          <ArrowRight className="size-4 text-blue-500 flex-shrink-0 mt-0.5" />
                          Getting unstuck when you know what you want to say but can't find the words
                        </li>
                        <li className="flex items-start gap-2 text-sm text-neutral-700">
                          <ArrowRight className="size-4 text-blue-500 flex-shrink-0 mt-0.5" />
                          Polishing specific sentences or paragraphs
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              </Card>

              {/* AI Story Assistant - Chat Mode */}
              <Card className="overflow-hidden">
                <div className="bg-gradient-to-r from-emerald-50 to-teal-50 p-6 border-b">
                  <div className="flex items-start gap-4">
                    <div className="size-14 rounded-xl bg-emerald-500 flex items-center justify-center flex-shrink-0">
                      <MessageSquare className="size-7 text-white" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-neutral-900">AI Story Assistant (Chat Mode)</h3>
                        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Conversational</Badge>
                      </div>
                      <p className="text-neutral-600">
                        A thoughtful conversational partner that helps you explore memories and develop story ideas
                      </p>
                    </div>
                  </div>
                </div>
                <div className="p-6 space-y-6">
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-neutral-900 mb-3 flex items-center gap-2">
                        <span className="size-6 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-sm">1</span>
                        What It Does
                      </h4>
                      <p className="text-neutral-700 leading-relaxed">
                        The Chat Mode AI opens in a dedicated interface where you can have a natural conversation 
                        about memories and stories. It asks thoughtful questions, helps you remember forgotten details, 
                        and guides you through the process of developing a coherent narrative. It's like talking to 
                        an empathetic interviewer who's genuinely interested in the story you're trying to tell.
                      </p>
                    </div>

                    <div>
                      <h4 className="text-neutral-900 mb-3 flex items-center gap-2">
                        <span className="size-6 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-sm">2</span>
                        Key Capabilities
                      </h4>
                      <div className="grid md:grid-cols-2 gap-3">
                        <div className="flex items-start gap-2">
                          <CheckCircle2 className="size-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm text-neutral-900">Memory Prompting</p>
                            <p className="text-xs text-neutral-600">Ask questions that unlock forgotten memories and details</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <CheckCircle2 className="size-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm text-neutral-900">Story Structure Guidance</p>
                            <p className="text-xs text-neutral-600">Help organize scattered thoughts into coherent narratives</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <CheckCircle2 className="size-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm text-neutral-900">Contextual Follow-ups</p>
                            <p className="text-xs text-neutral-600">Ask deeper questions based on what you've shared</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <CheckCircle2 className="size-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm text-neutral-900">Brainstorming Partner</p>
                            <p className="text-xs text-neutral-600">Explore different angles and perspectives on a memory</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <CheckCircle2 className="size-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm text-neutral-900">Connection Finding</p>
                            <p className="text-xs text-neutral-600">Identify themes and connections between different stories</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <CheckCircle2 className="size-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm text-neutral-900">Export to Draft</p>
                            <p className="text-xs text-neutral-600">Convert your conversation into a story draft with one click</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-neutral-900 mb-3 flex items-center gap-2">
                        <span className="size-6 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-sm">3</span>
                        Best Used For
                      </h4>
                      <ul className="space-y-2">
                        <li className="flex items-start gap-2 text-sm text-neutral-700">
                          <ArrowRight className="size-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                          Starting from scratch when you have a general memory but aren't sure how to tell it
                        </li>
                        <li className="flex items-start gap-2 text-sm text-neutral-700">
                          <ArrowRight className="size-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                          Exploring multiple story ideas to see which one resonates most
                        </li>
                        <li className="flex items-start gap-2 text-sm text-neutral-700">
                          <ArrowRight className="size-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                          Getting help remembering details you've partially forgotten
                        </li>
                        <li className="flex items-start gap-2 text-sm text-neutral-700">
                          <ArrowRight className="size-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                          Working through emotional stories that are difficult to articulate
                        </li>
                      </ul>
                    </div>

                    <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-100">
                      <p className="text-sm text-emerald-900">
                        <strong>Example:</strong> "I remember my grandmother's kitchen, but I'm not sure how to describe it..." 
                        The AI might respond: "Let's explore that memory together. What's the first thing that comes to 
                        mind when you picture her kitchen? Was it the smell, the sounds, or something visual?"
                      </p>
                    </div>
                  </div>
                </div>
              </Card>

              {/* AI Agent Panel */}
              <Card className="overflow-hidden">
                <div className="bg-gradient-to-r from-purple-50 to-fuchsia-50 p-6 border-b">
                  <div className="flex items-start gap-4">
                    <div className="size-14 rounded-xl bg-purple-500 flex items-center justify-center flex-shrink-0">
                      <Bot className="size-7 text-white" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-neutral-900">AI Agent Panel</h3>
                        <Badge className="bg-purple-100 text-purple-700 border-purple-200">Advanced</Badge>
                      </div>
                      <p className="text-neutral-600">
                        A powerful split-screen workspace with real-time AI suggestions and story enhancement tools
                      </p>
                    </div>
                  </div>
                </div>
                <div className="p-6 space-y-6">
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-neutral-900 mb-3 flex items-center gap-2">
                        <span className="size-6 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-sm">1</span>
                        What It Does
                      </h4>
                      <p className="text-neutral-700 leading-relaxed">
                        The AI Agent Panel gives you a dedicated workspace with your story editor on one side and 
                        an intelligent AI panel on the other. Unlike the quick-help inline assistant, this is a 
                        full-featured environment for serious story development. It analyzes your entire story in 
                        real-time and provides contextual suggestions, refinements, and enhancements. Perfect for 
                        when you want to craft something truly polished.
                      </p>
                    </div>

                    <div>
                      <h4 className="text-neutral-900 mb-3 flex items-center gap-2">
                        <span className="size-6 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-sm">2</span>
                        Key Capabilities
                      </h4>
                      <div className="grid md:grid-cols-2 gap-3">
                        <div className="flex items-start gap-2">
                          <CheckCircle2 className="size-5 text-purple-500 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm text-neutral-900">Real-Time Analysis</p>
                            <p className="text-xs text-neutral-600">Continuous feedback as you write with live suggestions</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <CheckCircle2 className="size-5 text-purple-500 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm text-neutral-900">Tone Adjustment</p>
                            <p className="text-xs text-neutral-600">Shift between formal, casual, emotional, or celebratory tones</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <CheckCircle2 className="size-5 text-purple-500 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm text-neutral-900">Story Enhancement</p>
                            <p className="text-xs text-neutral-600">Suggestions for adding depth, emotion, and descriptive details</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <CheckCircle2 className="size-5 text-purple-500 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm text-neutral-900">Legacy Context Awareness</p>
                            <p className="text-xs text-neutral-600">Uses knowledge of the person to suggest relevant prompts</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <CheckCircle2 className="size-5 text-purple-500 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm text-neutral-900">Grammar & Clarity</p>
                            <p className="text-xs text-neutral-600">Professional-level editing for polish and readability</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <CheckCircle2 className="size-5 text-purple-500 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm text-neutral-900">Title & Summary Generation</p>
                            <p className="text-xs text-neutral-600">Auto-generate compelling titles and story summaries</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <CheckCircle2 className="size-5 text-purple-500 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm text-neutral-900">Memory Prompts</p>
                            <p className="text-xs text-neutral-600">Contextual questions to help you remember more details</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <CheckCircle2 className="size-5 text-purple-500 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm text-neutral-900">Multiple Variations</p>
                            <p className="text-xs text-neutral-600">Generate alternative phrasings to choose the best version</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-neutral-900 mb-3 flex items-center gap-2">
                        <span className="size-6 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-sm">3</span>
                        Best Used For
                      </h4>
                      <ul className="space-y-2">
                        <li className="flex items-start gap-2 text-sm text-neutral-700">
                          <ArrowRight className="size-4 text-purple-500 flex-shrink-0 mt-0.5" />
                          Crafting longer, more detailed stories that deserve extra attention
                        </li>
                        <li className="flex items-start gap-2 text-sm text-neutral-700">
                          <ArrowRight className="size-4 text-purple-500 flex-shrink-0 mt-0.5" />
                          Refining and polishing important stories (eulogies, keynote tributes, etc.)
                        </li>
                        <li className="flex items-start gap-2 text-sm text-neutral-700">
                          <ArrowRight className="size-4 text-purple-500 flex-shrink-0 mt-0.5" />
                          When you want professional-quality writing but aren't a professional writer
                        </li>
                        <li className="flex items-start gap-2 text-sm text-neutral-700">
                          <ArrowRight className="size-4 text-purple-500 flex-shrink-0 mt-0.5" />
                          Transforming rough drafts into polished, emotional narratives
                        </li>
                      </ul>
                    </div>

                    <div className="bg-purple-50 rounded-lg p-4 border border-purple-100">
                      <p className="text-sm text-purple-900">
                        <strong>Pro Tip:</strong> Start your story in the regular editor, then switch to the AI Agent 
                        Panel when you're ready to refine. The split-screen view lets you see suggestions without 
                        losing sight of your original work.
                      </p>
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            {/* Comparison Summary */}
            <Card className="mt-8 p-8 bg-gradient-to-br from-neutral-50 to-neutral-100">
              <h3 className="text-neutral-900 mb-6 text-center">Which AI Agent Should You Use?</h3>
              <div className="grid md:grid-cols-3 gap-6">
                <div className="space-y-3">
                  <div className="size-12 rounded-lg bg-blue-500 flex items-center justify-center">
                    <Sparkles className="size-6 text-white" />
                  </div>
                  <h4 className="text-neutral-900">Inline Assistant</h4>
                  <p className="text-sm text-neutral-600">
                    Quick edits while writing. Great for immediate help with specific sentences.
                  </p>
                  <p className="text-xs text-neutral-500">⏱️ Use when you need quick help</p>
                </div>
                <div className="space-y-3">
                  <div className="size-12 rounded-lg bg-emerald-500 flex items-center justify-center">
                    <MessageSquare className="size-6 text-white" />
                  </div>
                  <h4 className="text-neutral-900">Chat Mode</h4>
                  <p className="text-sm text-neutral-600">
                    Conversational exploration. Perfect for brainstorming and developing ideas.
                  </p>
                  <p className="text-xs text-neutral-500">💭 Use when starting from scratch</p>
                </div>
                <div className="space-y-3">
                  <div className="size-12 rounded-lg bg-purple-500 flex items-center justify-center">
                    <Bot className="size-6 text-white" />
                  </div>
                  <h4 className="text-neutral-900">Agent Panel</h4>
                  <p className="text-sm text-neutral-600">
                    Professional refinement. Best for polishing important, detailed stories.
                  </p>
                  <p className="text-xs text-neutral-500">✨ Use for high-quality results</p>
                </div>
              </div>
            </Card>
          </div>
        </section>

        {/* AI Agent Personas */}
        <section className="bg-white py-16">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-12 space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[rgb(var(--theme-accent-light))] border border-[rgb(var(--theme-accent))]">
                <Users className="size-4 text-[rgb(var(--theme-primary))]" />
                <span className="text-sm text-[rgb(var(--theme-primary-dark))]">AI Personalities</span>
              </div>
              <h2 className="text-neutral-900">Four Unique Conversation Styles</h2>
              <p className="text-neutral-600 max-w-2xl mx-auto">
                Each AI agent can adopt different personas to match your storytelling needs. Choose the personality 
                that best fits the type of story you're creating and how you want to explore it.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
              {/* Reporter */}
              <Card className="overflow-hidden">
                <div className="bg-gradient-to-br from-amber-50 to-orange-50 p-6 border-b border-amber-100">
                  <div className="flex items-start gap-4">
                    <div className="size-16 rounded-xl bg-amber-500 flex items-center justify-center flex-shrink-0 shadow-lg">
                      <span className="text-3xl">📰</span>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-neutral-900">The Reporter</h3>
                        <Badge className="bg-amber-100 text-amber-700 border-amber-200">Investigative</Badge>
                      </div>
                      <p className="text-neutral-600 text-sm">
                        "Let's get the facts straight and uncover the full story"
                      </p>
                    </div>
                  </div>
                </div>
                <div className="p-6 space-y-4">
                  <div>
                    <h4 className="text-neutral-900 mb-2">Personality & Approach</h4>
                    <p className="text-sm text-neutral-700 leading-relaxed">
                      The Reporter is direct, curious, and thorough. This persona asks probing questions to gather 
                      comprehensive details about events, timelines, and facts. It's methodical and systematic, 
                      ensuring no important detail is overlooked.
                    </p>
                  </div>

                  <div>
                    <h4 className="text-neutral-900 mb-2">Best For</h4>
                    <ul className="space-y-2 text-sm text-neutral-700">
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="size-4 text-amber-500 flex-shrink-0 mt-0.5" />
                        <span>Documenting historical events or significant life milestones</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="size-4 text-amber-500 flex-shrink-0 mt-0.5" />
                        <span>Career retrospectives and professional achievements</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="size-4 text-amber-500 flex-shrink-0 mt-0.5" />
                        <span>When accuracy and chronological order matter most</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="size-4 text-amber-500 flex-shrink-0 mt-0.5" />
                        <span>Capturing the "who, what, when, where, why" of a story</span>
                      </li>
                    </ul>
                  </div>

                  <div className="bg-amber-50 rounded-lg p-4 border border-amber-100">
                    <p className="text-xs text-amber-900">
                      <strong>Example Questions:</strong> "Can you walk me through exactly what happened that day?" 
                      • "Who else was present?" • "What year was this?" • "What led up to this moment?"
                    </p>
                  </div>

                  <div>
                    <h4 className="text-neutral-900 mb-2">Conversation Style</h4>
                    <p className="text-xs text-neutral-600">
                      Structured • Fact-focused • Detail-oriented • Chronological • Professional
                    </p>
                  </div>
                </div>
              </Card>

              {/* Biographer */}
              <Card className="overflow-hidden">
                <div className="bg-gradient-to-br from-indigo-50 to-blue-50 p-6 border-b border-indigo-100">
                  <div className="flex items-start gap-4">
                    <div className="size-16 rounded-xl bg-indigo-500 flex items-center justify-center flex-shrink-0 shadow-lg">
                      <span className="text-3xl">📖</span>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-neutral-900">The Biographer</h3>
                        <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200">Narrative</Badge>
                      </div>
                      <p className="text-neutral-600 text-sm">
                        "Every life tells a story—let's craft yours beautifully"
                      </p>
                    </div>
                  </div>
                </div>
                <div className="p-6 space-y-4">
                  <div>
                    <h4 className="text-neutral-900 mb-2">Personality & Approach</h4>
                    <p className="text-sm text-neutral-700 leading-relaxed">
                      The Biographer is thoughtful, literary, and narrative-focused. This persona helps you see 
                      the bigger picture—how individual moments connect to form a life's journey. It's interested 
                      in themes, patterns, and the deeper meaning behind events.
                    </p>
                  </div>

                  <div>
                    <h4 className="text-neutral-900 mb-2">Best For</h4>
                    <ul className="space-y-2 text-sm text-neutral-700">
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="size-4 text-indigo-500 flex-shrink-0 mt-0.5" />
                        <span>Creating comprehensive life stories with narrative arc</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="size-4 text-indigo-500 flex-shrink-0 mt-0.5" />
                        <span>Identifying themes and patterns across someone's life</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="size-4 text-indigo-500 flex-shrink-0 mt-0.5" />
                        <span>Memorial tributes that capture someone's essence</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="size-4 text-indigo-500 flex-shrink-0 mt-0.5" />
                        <span>When you want polished, literary-quality storytelling</span>
                      </li>
                    </ul>
                  </div>

                  <div className="bg-indigo-50 rounded-lg p-4 border border-indigo-100">
                    <p className="text-xs text-indigo-900">
                      <strong>Example Questions:</strong> "What values defined their life?" • "How did this 
                      experience shape who they became?" • "What would you say was the central theme of their story?" 
                      • "How does this connect to other moments in their life?"
                    </p>
                  </div>

                  <div>
                    <h4 className="text-neutral-900 mb-2">Conversation Style</h4>
                    <p className="text-xs text-neutral-600">
                      Reflective • Thematic • Big-picture • Literary • Meaningful
                    </p>
                  </div>
                </div>
              </Card>

              {/* Friend */}
              <Card className="overflow-hidden">
                <div className="bg-gradient-to-br from-rose-50 to-pink-50 p-6 border-b border-rose-100">
                  <div className="flex items-start gap-4">
                    <div className="size-16 rounded-xl bg-rose-500 flex items-center justify-center flex-shrink-0 shadow-lg">
                      <span className="text-3xl">💬</span>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-neutral-900">The Friend</h3>
                        <Badge className="bg-rose-100 text-rose-700 border-rose-200">Empathetic</Badge>
                      </div>
                      <p className="text-neutral-600 text-sm">
                        "I'm here to listen—tell me what's in your heart"
                      </p>
                    </div>
                  </div>
                </div>
                <div className="p-6 space-y-4">
                  <div>
                    <h4 className="text-neutral-900 mb-2">Personality & Approach</h4>
                    <p className="text-sm text-neutral-700 leading-relaxed">
                      The Friend is warm, empathetic, and emotionally intelligent. This persona creates a safe, 
                      comfortable space for sharing memories—especially emotional or difficult ones. It validates 
                      feelings and encourages authentic expression without judgment.
                    </p>
                  </div>

                  <div>
                    <h4 className="text-neutral-900 mb-2">Best For</h4>
                    <ul className="space-y-2 text-sm text-neutral-700">
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="size-4 text-rose-500 flex-shrink-0 mt-0.5" />
                        <span>Processing grief and loss through storytelling</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="size-4 text-rose-500 flex-shrink-0 mt-0.5" />
                        <span>Sharing deeply personal or emotional memories</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="size-4 text-rose-500 flex-shrink-0 mt-0.5" />
                        <span>When you need encouragement and emotional support</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="size-4 text-rose-500 flex-shrink-0 mt-0.5" />
                        <span>Exploring feelings and relationships, not just events</span>
                      </li>
                    </ul>
                  </div>

                  <div className="bg-rose-50 rounded-lg p-4 border border-rose-100">
                    <p className="text-xs text-rose-900">
                      <strong>Example Questions:</strong> "How did that make you feel?" • "That sounds really 
                      meaningful—tell me more." • "What do you miss most about them?" • "It's okay to take your 
                      time with this. What comes to mind when you think about...?"
                    </p>
                  </div>

                  <div>
                    <h4 className="text-neutral-900 mb-2">Conversation Style</h4>
                    <p className="text-xs text-neutral-600">
                      Warm • Supportive • Emotionally attuned • Gentle • Non-judgmental
                    </p>
                  </div>
                </div>
              </Card>

              {/* Digital Twin */}
              <Card className="overflow-hidden">
                <div className="bg-gradient-to-br from-violet-50 to-purple-50 p-6 border-b border-violet-100">
                  <div className="flex items-start gap-4">
                    <div className="size-16 rounded-xl bg-violet-500 flex items-center justify-center flex-shrink-0 shadow-lg">
                      <span className="text-3xl">🤖</span>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-neutral-900">The Digital Twin</h3>
                        <Badge className="bg-violet-100 text-violet-700 border-violet-200">Immersive</Badge>
                      </div>
                      <p className="text-neutral-600 text-sm">
                        "Let me help you imagine their voice, perspective, and wisdom"
                      </p>
                    </div>
                  </div>
                </div>
                <div className="p-6 space-y-4">
                  <div>
                    <h4 className="text-neutral-900 mb-2">Personality & Approach</h4>
                    <p className="text-sm text-neutral-700 leading-relaxed">
                      The Digital Twin is unique—it helps you explore how the person being honored might have 
                      thought, spoken, or responded to situations. Based on all the stories and information in 
                      the Legacy, it creates an immersive way to keep their voice and perspective alive.
                    </p>
                  </div>

                  <div>
                    <h4 className="text-neutral-900 mb-2">Best For</h4>
                    <ul className="space-y-2 text-sm text-neutral-700">
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="size-4 text-violet-500 flex-shrink-0 mt-0.5" />
                        <span>Preserving someone's unique voice and mannerisms</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="size-4 text-violet-500 flex-shrink-0 mt-0.5" />
                        <span>Exploring "What would they say about this?"</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="size-4 text-violet-500 flex-shrink-0 mt-0.5" />
                        <span>Dementia care and memory preservation</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="size-4 text-violet-500 flex-shrink-0 mt-0.5" />
                        <span>Creating an interactive legacy for future generations</span>
                      </li>
                    </ul>
                  </div>

                  <div className="bg-violet-50 rounded-lg p-4 border border-violet-100">
                    <p className="text-xs text-violet-900">
                      <strong>Example Interactions:</strong> "Based on everything you've shared, here's how I think 
                      they might have told this story..." • "They often said things like..." • "If they were here now, 
                      they might say..." • "Let me share a memory the way they would have told it."
                    </p>
                  </div>

                  <div>
                    <h4 className="text-neutral-900 mb-2">Conversation Style</h4>
                    <p className="text-xs text-neutral-600">
                      Immersive • Voice-preserving • Perspective-taking • Interactive • Legacy-extending
                    </p>
                  </div>

                  <div className="mt-4 p-3 bg-violet-100 rounded-lg border border-violet-200">
                    <p className="text-xs text-violet-900">
                      <strong>Note:</strong> The Digital Twin becomes more accurate and authentic as more stories 
                      and details are added to the Legacy. It learns from all contributions to better capture the 
                      person's unique essence.
                    </p>
                  </div>
                </div>
              </Card>
            </div>

            {/* Persona Selection Guide */}
            <Card className="mt-8 p-8 bg-gradient-to-br from-neutral-50 to-neutral-100">
              <h3 className="text-neutral-900 mb-6 text-center">Choosing the Right Persona for Your Story</h3>
              <div className="grid md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <h4 className="text-neutral-900">For Factual Documentation</h4>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">📰</span>
                      <div>
                        <p className="text-sm text-neutral-900">Use The Reporter</p>
                        <p className="text-xs text-neutral-600">Career history, achievements, timelines</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">📖</span>
                      <div>
                        <p className="text-sm text-neutral-900">Use The Biographer</p>
                        <p className="text-xs text-neutral-600">Life story, legacy projects, comprehensive tributes</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-neutral-900">For Emotional Connection</h4>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">💬</span>
                      <div>
                        <p className="text-sm text-neutral-900">Use The Friend</p>
                        <p className="text-xs text-neutral-600">Grief processing, personal memories, emotional stories</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">🤖</span>
                      <div>
                        <p className="text-sm text-neutral-900">Use The Digital Twin</p>
                        <p className="text-xs text-neutral-600">Voice preservation, interactive legacy, ongoing connection</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-6 border-t border-neutral-200 text-center">
                <p className="text-sm text-neutral-600">
                  💡 <strong>Pro Tip:</strong> You can switch between personas at any time during your conversation. 
                  Start with The Reporter to gather facts, then switch to The Friend to explore feelings, or try 
                  The Digital Twin to imagine how they would tell their own story.
                </p>
              </div>
            </Card>
          </div>
        </section>

        {/* Community Feature */}
        <section className="bg-white py-16">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-12 space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[rgb(var(--theme-accent-light))] border border-[rgb(var(--theme-accent))]">
                <Users className="size-4 text-[rgb(var(--theme-primary))]" />
                <span className="text-sm text-[rgb(var(--theme-primary-dark))]">Connect & Support</span>
              </div>
              <h2 className="text-neutral-900">Community: Connect Without AI</h2>
              <p className="text-neutral-600 max-w-2xl mx-auto">
                While AI helps you create beautiful stories, sometimes you need the support and connection that only 
                other people can provide. Our Community feature creates spaces for genuine human connection.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8 mb-12">
              {/* What is Community */}
              <Card className="p-8 space-y-6">
                <div className="flex items-start gap-4">
                  <div className="size-14 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center flex-shrink-0 shadow-lg">
                    <MessageCircle className="size-7 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-neutral-900 mb-2">What is Community?</h3>
                    <p className="text-sm text-neutral-700 leading-relaxed">
                      Community is a dedicated space where Mosaic Life users can connect with each other—without AI 
                      involvement. Share experiences, offer support, exchange ideas, and find comfort with others 
                      who understand what you're going through.
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-neutral-900">What You Can Do</h4>
                  <ul className="space-y-2 text-sm text-neutral-700">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="size-4 text-blue-500 flex-shrink-0 mt-0.5" />
                      <span>Join existing communities around shared experiences or interests</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="size-4 text-blue-500 flex-shrink-0 mt-0.5" />
                      <span>Create your own community (public or private)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="size-4 text-blue-500 flex-shrink-0 mt-0.5" />
                      <span>Share stories and Legacies with community members</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="size-4 text-blue-500 flex-shrink-0 mt-0.5" />
                      <span>Participate in discussions and offer support to others</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="size-4 text-blue-500 flex-shrink-0 mt-0.5" />
                      <span>Find resources and advice from people with similar experiences</span>
                    </li>
                  </ul>
                </div>
              </Card>

              {/* Public vs Private Communities */}
              <Card className="p-8 space-y-6">
                <h3 className="text-neutral-900">Public vs. Private Communities</h3>
                
                <div className="space-y-4">
                  <div className="p-4 rounded-lg bg-blue-50 border border-blue-100">
                    <div className="flex items-start gap-3 mb-2">
                      <Globe className="size-5 text-blue-600 flex-shrink-0 mt-0.5" />
                      <h4 className="text-neutral-900">Public Communities</h4>
                    </div>
                    <p className="text-sm text-neutral-700 leading-relaxed mb-3">
                      Open to everyone. Anyone can discover, view, and request to join.
                    </p>
                    <p className="text-xs text-neutral-600">
                      <strong>Best for:</strong> General topics, celebration communities, educational groups, 
                      and open support networks
                    </p>
                  </div>

                  <div className="p-4 rounded-lg bg-purple-50 border border-purple-100">
                    <div className="flex items-start gap-3 mb-2">
                      <Lock className="size-5 text-purple-600 flex-shrink-0 mt-0.5" />
                      <h4 className="text-neutral-900">Private Communities</h4>
                    </div>
                    <p className="text-sm text-neutral-700 leading-relaxed mb-3">
                      Hidden from public view. Only visible to invited members.
                    </p>
                    <p className="text-xs text-neutral-600">
                      <strong>Best for:</strong> Sensitive topics, grief support circles, family groups, 
                      and intimate support networks
                    </p>
                  </div>
                </div>

                <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-200">
                  <p className="text-xs text-neutral-700">
                    <strong>Note:</strong> When you create a community, you become its moderator and can manage 
                    members, discussions, and settings.
                  </p>
                </div>
              </Card>
            </div>

            {/* Community Guidelines */}
            <Card className="p-8 bg-gradient-to-br from-neutral-50 to-neutral-100">
              <div className="flex items-start gap-4 mb-6">
                <div className="size-12 rounded-full bg-[rgb(var(--theme-accent-light))] flex items-center justify-center flex-shrink-0">
                  <Shield className="size-6 text-[rgb(var(--theme-primary))]" />
                </div>
                <div>
                  <h3 className="text-neutral-900 mb-2">Community Guidelines</h3>
                  <p className="text-sm text-neutral-600">
                    All communities operate under these core principles to ensure a safe, supportive environment:
                  </p>
                </div>
              </div>

              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 rounded-lg bg-white border border-neutral-200">
                  <div className="flex items-center gap-2 mb-2">
                    <Heart className="size-5 text-red-500" />
                    <h4 className="text-sm text-neutral-900">Respect</h4>
                  </div>
                  <p className="text-xs text-neutral-600 leading-relaxed">
                    Respect others' space and privacy. Don't be rude, insensitive, mean, or mocking.
                  </p>
                </div>

                <div className="p-4 rounded-lg bg-white border border-neutral-200">
                  <div className="flex items-center gap-2 mb-2">
                    <Lightbulb className="size-5 text-blue-500" />
                    <h4 className="text-sm text-neutral-900">Understanding</h4>
                  </div>
                  <p className="text-xs text-neutral-600 leading-relaxed">
                    People may be going through difficult times. Don't bother them or make them uncomfortable.
                  </p>
                </div>

                <div className="p-4 rounded-lg bg-white border border-neutral-200">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="size-5 text-green-500" />
                    <h4 className="text-sm text-neutral-900">Kindness</h4>
                  </div>
                  <p className="text-xs text-neutral-600 leading-relaxed">
                    Always be kind. A little compassion goes a long way in supporting others.
                  </p>
                </div>

                <div className="p-4 rounded-lg bg-white border border-neutral-200">
                  <div className="flex items-center gap-2 mb-2">
                    <MessageCircle className="size-5 text-purple-500" />
                    <h4 className="text-sm text-neutral-900">Language</h4>
                  </div>
                  <p className="text-xs text-neutral-600 leading-relaxed">
                    Do not use hateful, insensitive, or profane language. Keep discussions respectful.
                  </p>
                </div>
              </div>
            </Card>

            {/* Example Communities */}
            <div className="mt-12 space-y-6">
              <h3 className="text-neutral-900 text-center">Example Communities</h3>
              <div className="grid md:grid-cols-3 gap-6">
                <Card className="p-6 space-y-3">
                  <div className="text-3xl">🎖️</div>
                  <h4 className="text-neutral-900">Remembering Our Veterans</h4>
                  <p className="text-sm text-neutral-600">
                    A space to honor and share stories of military veterans and their service.
                  </p>
                  <div className="flex items-center gap-2 text-xs text-neutral-500">
                    <Globe className="size-3" />
                    <span>Public • 342 members</span>
                  </div>
                </Card>

                <Card className="p-6 space-y-3">
                  <div className="text-3xl">🕊️</div>
                  <h4 className="text-neutral-900">Grief Support Circle</h4>
                  <p className="text-sm text-neutral-600">
                    A private, compassionate space for those navigating loss. Share your journey and find comfort.
                  </p>
                  <div className="flex items-center gap-2 text-xs text-neutral-500">
                    <Lock className="size-3" />
                    <span>Private • 127 members</span>
                  </div>
                </Card>

                <Card className="p-6 space-y-3">
                  <div className="text-3xl">👨‍👩‍👧‍👦</div>
                  <h4 className="text-neutral-900">Preserving Family History</h4>
                  <p className="text-sm text-neutral-600">
                    Tips, tools, and stories for documenting your family legacy for future generations.
                  </p>
                  <div className="flex items-center gap-2 text-xs text-neutral-500">
                    <Globe className="size-3" />
                    <span>Public • 423 members</span>
                  </div>
                </Card>
              </div>
            </div>

            {/* CTA to Community */}
            <div className="mt-12 text-center">
              <Button 
                size="lg"
                className="gap-2 bg-[rgb(var(--theme-primary))] hover:bg-[rgb(var(--theme-primary-dark))]"
                onClick={() => onNavigate('community')}
              >
                <Users className="size-5" />
                Explore Communities
              </Button>
            </div>
          </div>
        </section>

        {/* Privacy & Security */}
        <section className="py-16">
          <div className="max-w-5xl mx-auto px-6">
            <Card className="bg-gradient-to-br from-[rgb(var(--theme-gradient-from))] to-[rgb(var(--theme-gradient-to))] border-[rgb(var(--theme-accent))] p-8 md:p-12">
              <div className="flex flex-col md:flex-row items-start gap-8">
                <div className="flex-shrink-0">
                  <div className="size-16 rounded-full bg-white/80 flex items-center justify-center">
                    <Shield className="size-8 text-[rgb(var(--theme-primary))]" />
                  </div>
                </div>
                <div className="space-y-4">
                  <h2 className="text-neutral-900">Privacy & Control</h2>
                  <div className="space-y-3 text-neutral-700">
                    <p className="leading-relaxed">
                      <strong>You're in control.</strong> Every Legacy can be set to public, private, or invite-only. 
                      You decide who can view, contribute, or comment.
                    </p>
                    <p className="leading-relaxed">
                      <strong>Your data is yours.</strong> Export your stories, photos, and media anytime. 
                      Delete your account and all associated data if you choose.
                    </p>
                    <p className="leading-relaxed">
                      <strong>Respect and security.</strong> We use industry-standard encryption and never sell 
                      your data. Your stories are precious, and we treat them that way.
                    </p>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </section>

        {/* CTA Section */}
        <section className="bg-white py-16">
          <div className="max-w-4xl mx-auto px-6">
            <Card className="bg-gradient-to-br from-[rgb(var(--theme-gradient-from))] to-[rgb(var(--theme-gradient-to))] border border-[rgb(var(--theme-accent))] p-12 text-center">
              <div className="space-y-6">
                <h2 className="text-neutral-900">Ready to Start Creating?</h2>
                <p className="text-neutral-600 max-w-xl mx-auto">
                  Join others who are preserving the stories that matter most. Create your first Legacy today.
                </p>
                <div className="flex gap-4 justify-center flex-wrap">
                  <Button 
                    size="lg" 
                    className="gap-2 bg-[rgb(var(--theme-primary))] hover:bg-[rgb(var(--theme-primary-dark))]"
                    onClick={user ? () => onNavigate('story') : onAuthClick}
                  >
                    Create Your First Legacy
                    <ArrowRight className="size-4" />
                  </Button>
                  <Button 
                    size="lg" 
                    variant="outline"
                    onClick={() => onNavigate('about')}
                  >
                    Learn More About Us
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </section>
      </main>

      <Footer onNavigate={onNavigate} />
    </div>
  );
}