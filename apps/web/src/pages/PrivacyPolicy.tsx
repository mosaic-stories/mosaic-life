import { Mail, Eye, Lock, Trash2, Download, Share2, ShieldCheck, Key, Server, Globe } from 'lucide-react';
import { Card } from '@/components/ui/card';
import Footer from '@/components/Footer';
import { SEOHead } from '@/components/seo';

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-theme-background transition-colors duration-300 flex flex-col">
      <SEOHead
        title="Privacy Policy - Mosaic Life"
        description="Privacy Policy for Mosaic Life. Learn how we handle your data, protect your privacy, and put you in control of your content."
        path="/privacy"
      />
      <main className="flex-1">
        {/* Hero Section */}
        <section className="max-w-4xl mx-auto px-6 py-20">
          <div className="text-center space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-theme-accent-light border border-theme-accent">
              <ShieldCheck className="size-4 text-theme-primary" />
              <span className="text-sm text-theme-primary-dark">Privacy Policy</span>
            </div>

            <h1 className="text-neutral-900">
              Your data, your control
            </h1>

            <p className="text-neutral-600 max-w-2xl mx-auto text-lg leading-relaxed">
              We built Mosaic Life with a simple principle: your stories belong to you. This policy
              explains what data we collect, how we protect it, and the control you have over it.
            </p>

            <p className="text-sm text-neutral-500">
              Last updated: March 9, 2026
            </p>
          </div>
        </section>

        {/* You Own Your Data */}
        <section className="bg-white py-16">
          <div className="max-w-3xl mx-auto px-6 space-y-6">
            <div className="flex items-center gap-3">
              <Lock className="size-6 text-theme-primary flex-shrink-0" />
              <h2 className="text-neutral-900">You Own Your Data</h2>
            </div>
            <p className="text-neutral-700 leading-relaxed">
              Everything you create on Mosaic Life — stories, legacies, photos, conversations — belongs
              to you. We've designed the platform so that all content is tied directly to your account.
              We don't sell your data, we don't use it for advertising, and we don't share it with third
              parties for their own purposes.
            </p>
            <Card className="p-6 bg-theme-accent-light/50 border-theme-accent space-y-2">
              <p className="text-neutral-700 text-sm leading-relaxed">
                <strong>Built for ownership:</strong> The application is architected so that all content
                is associated with your user account. If you delete your account, your content goes with
                it. No hidden copies, no data hoarding.
              </p>
            </Card>
          </div>
        </section>

        {/* Private by Default */}
        <section className="py-16">
          <div className="max-w-3xl mx-auto px-6 space-y-6">
            <div className="flex items-center gap-3">
              <Eye className="size-6 text-theme-primary flex-shrink-0" />
              <h2 className="text-neutral-900">Private by Default</h2>
            </div>
            <p className="text-neutral-700 leading-relaxed">
              All content you create is private by default. Nobody can see your stories, legacies, or
              media unless you explicitly choose to share them.
            </p>
            <p className="text-neutral-700 leading-relaxed">
              You control who sees what through access control settings. You can make content visible to
              specific people, to contributors of a legacy, or to the broader community — it's entirely
              up to you.
            </p>
          </div>
        </section>

        {/* Shared Content */}
        <section className="bg-white py-16">
          <div className="max-w-3xl mx-auto px-6 space-y-6">
            <div className="flex items-center gap-3">
              <Share2 className="size-6 text-theme-primary flex-shrink-0" />
              <h2 className="text-neutral-900">When You Share Content</h2>
            </div>
            <p className="text-neutral-700 leading-relaxed">
              When you choose to make content visible to others, those people may interact with it in
              reasonable ways. This includes:
            </p>
            <ul className="space-y-3 text-neutral-700">
              <li className="flex gap-3">
                <span className="text-theme-primary font-medium">•</span>
                <span>Reading and engaging with stories you've shared</span>
              </li>
              <li className="flex gap-3">
                <span className="text-theme-primary font-medium">•</span>
                <span>Creating derivative stories that build on shared content</span>
              </li>
              <li className="flex gap-3">
                <span className="text-theme-primary font-medium">•</span>
                <span>Having AI persona conversations that draw on knowledge from shared stories</span>
              </li>
            </ul>
            <p className="text-neutral-700 leading-relaxed">
              If you believe someone is abusing access to your shared content, you can report it and we
              will make our best effort to investigate and resolve the issue.
            </p>
          </div>
        </section>

        {/* Data Export & Deletion */}
        <section className="py-16">
          <div className="max-w-3xl mx-auto px-6 space-y-6">
            <div className="flex items-center gap-3">
              <Download className="size-6 text-theme-primary flex-shrink-0" />
              <h2 className="text-neutral-900">Data Export & Deletion</h2>
            </div>
            <p className="text-neutral-700 leading-relaxed">
              You can export your content at any time. We believe you should never feel locked in —
              your stories are yours and you should be able to take them with you.
            </p>
            <div className="grid sm:grid-cols-2 gap-4">
              <Card className="p-5 space-y-2">
                <div className="flex items-center gap-2">
                  <Download className="size-5 text-theme-primary" />
                  <h3 className="text-neutral-900 text-base font-medium">Export</h3>
                </div>
                <p className="text-sm text-neutral-600 leading-relaxed">
                  Download your stories, legacies, and media at any time through your account settings.
                </p>
              </Card>
              <Card className="p-5 space-y-2">
                <div className="flex items-center gap-2">
                  <Trash2 className="size-5 text-theme-primary" />
                  <h3 className="text-neutral-900 text-base font-medium">Deletion</h3>
                </div>
                <p className="text-sm text-neutral-600 leading-relaxed">
                  Delete your account and all associated content is removed. No questions asked, no
                  retention period.
                </p>
              </Card>
            </div>
          </div>
        </section>

        {/* What We Collect */}
        <section className="bg-white py-16">
          <div className="max-w-3xl mx-auto px-6 space-y-6">
            <div className="flex items-center gap-3">
              <Globe className="size-6 text-theme-primary flex-shrink-0" />
              <h2 className="text-neutral-900">What We Collect</h2>
            </div>
            <p className="text-neutral-700 leading-relaxed">
              We collect only what's necessary to make the platform work:
            </p>
            <ul className="space-y-3 text-neutral-700">
              <li className="flex gap-3">
                <span className="text-theme-primary font-medium">•</span>
                <span>
                  <strong>Account information:</strong> Your name and email address from Google OAuth
                  sign-in, used to identify your account
                </span>
              </li>
              <li className="flex gap-3">
                <span className="text-theme-primary font-medium">•</span>
                <span>
                  <strong>Content you create:</strong> Stories, legacies, media, and conversations —
                  stored so you can access and share them
                </span>
              </li>
              <li className="flex gap-3">
                <span className="text-theme-primary font-medium">•</span>
                <span>
                  <strong>Usage data:</strong> Basic information about how you use the platform (such
                  as AI feature usage) to manage resource limits and improve the service
                </span>
              </li>
            </ul>
            <p className="text-neutral-700 leading-relaxed">
              We don't use tracking pixels, we don't build advertising profiles, and we don't sell
              or share your information with data brokers.
            </p>
          </div>
        </section>

        {/* Security */}
        <section className="py-16">
          <div className="max-w-3xl mx-auto px-6 space-y-6">
            <div className="flex items-center gap-3">
              <ShieldCheck className="size-6 text-theme-primary flex-shrink-0" />
              <h2 className="text-neutral-900">How We Protect Your Data</h2>
            </div>
            <p className="text-neutral-700 leading-relaxed">
              We take security seriously and follow modern best practices:
            </p>
            <ul className="space-y-3 text-neutral-700">
              <li className="flex gap-3">
                <span className="text-theme-primary font-medium">•</span>
                <span>
                  <strong>Encrypted at rest:</strong> All data stored on our servers is encrypted,
                  ensuring it's protected even at the storage level
                </span>
              </li>
              <li className="flex gap-3">
                <span className="text-theme-primary font-medium">•</span>
                <span>
                  <strong>Encrypted in transit:</strong> All communication between your browser and
                  our servers uses HTTPS/TLS encryption, preventing interference or eavesdropping
                </span>
              </li>
              <li className="flex gap-3">
                <span className="text-theme-primary font-medium">•</span>
                <span>
                  <strong>Security reviews:</strong> We conduct regular security reviews and maintain
                  network controls to protect against unauthorized access
                </span>
              </li>
              <li className="flex gap-3">
                <span className="text-theme-primary font-medium">•</span>
                <span>
                  <strong>Secure authentication:</strong> We use Google OAuth for sign-in, meaning we
                  never store or handle your password directly
                </span>
              </li>
            </ul>
          </div>
        </section>

        {/* API Keys */}
        <section className="bg-white py-16">
          <div className="max-w-3xl mx-auto px-6 space-y-6">
            <div className="flex items-center gap-3">
              <Key className="size-6 text-theme-primary flex-shrink-0" />
              <h2 className="text-neutral-900">Your API Keys</h2>
            </div>
            <p className="text-neutral-700 leading-relaxed">
              If you provide your own API keys to use third-party AI model providers, those keys are
              used exclusively for your requests. They are never shared with other users, never used
              for any purpose other than processing your AI interactions, and are stored with the same
              encryption protections as all other data on the platform.
            </p>
          </div>
        </section>

        {/* Third-Party Services */}
        <section className="py-16">
          <div className="max-w-3xl mx-auto px-6 space-y-6">
            <div className="flex items-center gap-3">
              <Server className="size-6 text-theme-primary flex-shrink-0" />
              <h2 className="text-neutral-900">Third-Party Services</h2>
            </div>
            <p className="text-neutral-700 leading-relaxed">
              To provide certain features, we use third-party services:
            </p>
            <ul className="space-y-3 text-neutral-700">
              <li className="flex gap-3">
                <span className="text-theme-primary font-medium">•</span>
                <span>
                  <strong>Google OAuth:</strong> For authentication — Google receives the data
                  necessary to verify your identity
                </span>
              </li>
              <li className="flex gap-3">
                <span className="text-theme-primary font-medium">•</span>
                <span>
                  <strong>AI model providers:</strong> Story content may be sent to AI services
                  (such as AWS Bedrock) to power features like story prompts and persona
                  conversations. This data is used only to generate responses and is not retained
                  by these providers for training purposes
                </span>
              </li>
              <li className="flex gap-3">
                <span className="text-theme-primary font-medium">•</span>
                <span>
                  <strong>Cloud infrastructure:</strong> Our servers run on AWS, which provides
                  the underlying infrastructure and storage
                </span>
              </li>
            </ul>
          </div>
        </section>

        {/* Self-Hosting */}
        <section className="bg-white py-16">
          <div className="max-w-3xl mx-auto px-6 space-y-6">
            <h2 className="text-neutral-900">Self-Hosting Option</h2>
            <p className="text-neutral-700 leading-relaxed">
              Mosaic Life is open source. If you want complete control over your data and
              infrastructure, you're welcome to host your own instance. When self-hosting, your data
              never touches our servers — you're fully in charge of your own privacy and security
              practices.
            </p>
          </div>
        </section>

        {/* Changes */}
        <section className="py-16">
          <div className="max-w-3xl mx-auto px-6 space-y-6">
            <h2 className="text-neutral-900">Changes to This Policy</h2>
            <p className="text-neutral-700 leading-relaxed">
              We may update this privacy policy as the platform evolves. When we make significant
              changes, we'll do our best to notify you. We encourage you to review this page
              periodically. Continued use of the platform after changes are posted constitutes
              acceptance of the updated policy.
            </p>
          </div>
        </section>

        {/* Contact */}
        <section className="bg-white py-16">
          <div className="max-w-3xl mx-auto px-6">
            <div className="text-center space-y-6">
              <h2 className="text-neutral-900">Privacy Questions?</h2>
              <p className="text-neutral-600">
                If you have questions about how your data is handled, want to request an export, or
                need to report a concern, reach out anytime.
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
