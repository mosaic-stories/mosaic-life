import {
  Users,
  MessageCircle,
  Globe,
  Lock,
  Heart,
  Lightbulb,
  Sparkles,
  Shield,
  CheckCircle2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { exampleCommunities } from './howItWorksData';

export function CommunitySection() {
  const navigate = useNavigate();

  return (
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
            {exampleCommunities.map((community) => (
              <Card key={community.title} className="p-6 space-y-3">
                <div className="text-3xl">{community.emoji}</div>
                <h4 className="text-neutral-900">{community.title}</h4>
                <p className="text-sm text-neutral-600">
                  {community.description}
                </p>
                <div className="flex items-center gap-2 text-xs text-neutral-500">
                  {community.visibility === 'public' ? (
                    <Globe className="size-3" />
                  ) : (
                    <Lock className="size-3" />
                  )}
                  <span>{community.visibility === 'public' ? 'Public' : 'Private'} {'\u2022'} {community.members} members</span>
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* CTA to Community */}
        <div className="mt-12 text-center">
          <Button
            size="lg"
            className="gap-2 bg-[rgb(var(--theme-primary))] hover:bg-[rgb(var(--theme-primary-dark))]"
            onClick={() => navigate('/community')}
          >
            <Users className="size-5" />
            Explore Communities
          </Button>
        </div>
      </div>
    </section>
  );
}
