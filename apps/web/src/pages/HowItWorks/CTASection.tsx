import { ArrowRight, Shield } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useAuthModal } from '@/lib/hooks/useAuthModal';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export function CTASection() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const openAuthModal = useAuthModal((s) => s.open);

  return (
    <>
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
                  onClick={user ? () => navigate('/legacy/new') : openAuthModal}
                >
                  Create Your First Legacy
                  <ArrowRight className="size-4" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => navigate('/about')}
                >
                  Learn More About Us
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </section>
    </>
  );
}
