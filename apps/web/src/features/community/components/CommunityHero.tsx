import { Users, Shield, Heart, Lightbulb, Sparkles, MessageCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';

export default function CommunityHero() {
  return (
    <>
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-[rgb(var(--theme-gradient-from))] to-[rgb(var(--theme-gradient-to))] py-12">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/80 backdrop-blur-sm border border-[rgb(var(--theme-accent))]">
              <Users className="size-4 text-[rgb(var(--theme-primary))]" />
              <span className="text-sm text-[rgb(var(--theme-primary-dark))]">Connect & Support</span>
            </div>
            <h1 className="text-neutral-900">Community</h1>
            <p className="text-neutral-600 max-w-2xl mx-auto text-lg">
              Connect with others, share experiences, and find support in spaces dedicated to honoring life's meaningful moments.
            </p>
          </div>
        </div>
      </section>

      {/* Community Guidelines */}
      <section className="max-w-7xl mx-auto px-6 -mt-6 relative z-10">
        <Card className="p-6 md:p-8 bg-white shadow-lg border-2 border-[rgb(var(--theme-accent))]">
          <div className="flex items-start gap-4">
            <div className="size-12 rounded-full bg-[rgb(var(--theme-accent-light))] flex items-center justify-center flex-shrink-0">
              <Shield className="size-6 text-[rgb(var(--theme-primary))]" />
            </div>
            <div className="flex-1 space-y-4">
              <div>
                <h2 className="text-neutral-900 mb-2">Community Guidelines</h2>
                <p className="text-sm text-neutral-600">
                  Our community is built on compassion and mutual support. Please follow these guidelines to keep this a safe, welcoming space for everyone.
                </p>
              </div>

              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="flex items-start gap-3 p-4 rounded-lg bg-red-50 border border-red-100">
                  <Heart className="size-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm text-neutral-900 mb-1">Respect</h4>
                    <p className="text-xs text-neutral-600 leading-relaxed">
                      Respect others' space and privacy. Don't be rude, insensitive, mean, or mocking.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-50 border border-blue-100">
                  <Lightbulb className="size-5 text-blue-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm text-neutral-900 mb-1">Understanding</h4>
                    <p className="text-xs text-neutral-600 leading-relaxed">
                      People may be going through difficult times. Don't bother them or make them uncomfortable.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-4 rounded-lg bg-green-50 border border-green-100">
                  <Sparkles className="size-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm text-neutral-900 mb-1">Kindness</h4>
                    <p className="text-xs text-neutral-600 leading-relaxed">
                      Always be kind. A little compassion goes a long way in supporting others.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-4 rounded-lg bg-purple-50 border border-purple-100">
                  <MessageCircle className="size-5 text-purple-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm text-neutral-900 mb-1">Language</h4>
                    <p className="text-xs text-neutral-600 leading-relaxed">
                      Do not use hateful, insensitive, or profane language. Keep discussions respectful.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </section>
    </>
  );
}
