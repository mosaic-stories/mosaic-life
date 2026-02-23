import { useNavigate } from 'react-router-dom';
import { Users, Shield, Heart, Sparkles, ArrowRight, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import Footer from '@/components/Footer';
import { SEOHead } from '@/components/seo';
import { useAuth } from '@/contexts/AuthContext';
import { useAuthModal } from '@/lib/hooks/useAuthModal';

export default function About() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const openAuthModal = useAuthModal((s) => s.open);
  return (
    <div className="min-h-screen bg-theme-background transition-colors duration-300 flex flex-col">
      <SEOHead
        title="About Mosaic Life"
        description="Learn about Mosaic Life and our mission to preserve meaningful stories and memories. Discover how we help families and communities honor the people who matter most."
        path="/about"
      />
      <main className="flex-1">
        {/* Hero Section */}
        <section className="max-w-4xl mx-auto px-6 py-20">
          <div className="text-center space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-theme-accent-light border border-theme-accent">
              <Heart className="size-4 text-theme-primary" />
              <span className="text-sm text-theme-primary-dark">Our Story</span>
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
              <Card className="p-12 bg-gradient-to-br from-theme-gradient-from to-theme-gradient-to border-theme-accent">
                <div className="space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="size-12 rounded-full bg-white/80 flex items-center justify-center">
                      <Users className="size-6 text-theme-primary" />
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
                  <Sparkles className="size-6 text-theme-primary" />
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
                  <div className="size-12 rounded-lg bg-theme-accent-light flex items-center justify-center">
                    <Shield className="size-6 text-theme-primary" />
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
                  <div className="size-12 rounded-lg bg-theme-accent-light flex items-center justify-center">
                    <Users className="size-6 text-theme-primary" />
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
                  <div className="size-12 rounded-lg bg-theme-accent-light flex items-center justify-center">
                    <Heart className="size-6 text-theme-primary" />
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
            <Card className="bg-gradient-to-br from-theme-gradient-from to-theme-gradient-to border border-theme-accent p-12 text-center">
              <div className="space-y-6">
                <h2 className="text-neutral-900">Start Creating a Legacy</h2>
                <p className="text-neutral-600 max-w-xl mx-auto">
                  Every person's story deserves to be told. Start preserving the memories that matter most.
                </p>
                <Button 
                  size="lg" 
                  className="gap-2 bg-theme-primary hover:bg-theme-primary-dark"
                  onClick={user ? () => navigate('/legacy/new') : openAuthModal}
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

      <Footer />
    </div>
  );
}