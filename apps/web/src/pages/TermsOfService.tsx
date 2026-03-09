import { Mail, Scale, Shield, Heart, Sparkles, AlertTriangle, Camera, MessageCircle, CreditCard, Users } from 'lucide-react';
import { Card } from '@/components/ui/card';
import Footer from '@/components/Footer';
import { SEOHead } from '@/components/seo';

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-theme-background transition-colors duration-300 flex flex-col">
      <SEOHead
        title="Terms of Service - Mosaic Life"
        description="Terms of Service for Mosaic Life. A common-sense guide to using our memorial stories platform respectfully and responsibly."
        path="/terms"
      />
      <main className="flex-1">
        {/* Hero Section */}
        <section className="max-w-4xl mx-auto px-6 py-20">
          <div className="text-center space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-theme-accent-light border border-theme-accent">
              <Scale className="size-4 text-theme-primary" />
              <span className="text-sm text-theme-primary-dark">Terms of Service</span>
            </div>

            <h1 className="text-neutral-900">
              A common-sense guide to using Mosaic Life
            </h1>

            <p className="text-neutral-600 max-w-2xl mx-auto text-lg leading-relaxed">
              We believe in keeping things straightforward. These terms are written in plain language
              because we think you should actually understand what you're agreeing to.
            </p>

            <p className="text-sm text-neutral-500">
              Last updated: March 9, 2026
            </p>
          </div>
        </section>

        {/* What Mosaic Life Is */}
        <section className="bg-white py-16">
          <div className="max-w-3xl mx-auto px-6 space-y-6">
            <div className="flex items-center gap-3">
              <Heart className="size-6 text-theme-primary flex-shrink-0" />
              <h2 className="text-neutral-900">What Mosaic Life Is</h2>
            </div>
            <p className="text-neutral-700 leading-relaxed">
              Mosaic Life is a platform for preserving and sharing life stories and memories. It's built by a sole
              developer who cares deeply about helping people honor the people who matter most to them. The platform
              is open source, meaning the code is freely available for anyone to use, modify, and host on their own.
            </p>
            <p className="text-neutral-700 leading-relaxed">
              If you're using the hosted instance at mosaiclife.me, these terms apply to you. If you're self-hosting,
              you're responsible for setting your own terms for your users.
            </p>
          </div>
        </section>

        {/* Be a Good Citizen */}
        <section className="py-16">
          <div className="max-w-3xl mx-auto px-6 space-y-6">
            <div className="flex items-center gap-3">
              <Users className="size-6 text-theme-primary flex-shrink-0" />
              <h2 className="text-neutral-900">Be a Good Citizen</h2>
            </div>
            <p className="text-neutral-700 leading-relaxed">
              This is a community built around honoring people's stories. We ask that you treat it — and
              the people in it — with respect. That means:
            </p>
            <ul className="space-y-3 text-neutral-700">
              <li className="flex gap-3">
                <span className="text-theme-primary font-medium">•</span>
                <span>Be respectful of others and the stories they share</span>
              </li>
              <li className="flex gap-3">
                <span className="text-theme-primary font-medium">•</span>
                <span>Don't use the platform to harass, bully, or demean anyone</span>
              </li>
              <li className="flex gap-3">
                <span className="text-theme-primary font-medium">•</span>
                <span>Don't post content that's illegal, hateful, or intentionally harmful</span>
              </li>
              <li className="flex gap-3">
                <span className="text-theme-primary font-medium">•</span>
                <span>Don't impersonate others or create legacies for people without their family's knowledge or consent</span>
              </li>
              <li className="flex gap-3">
                <span className="text-theme-primary font-medium">•</span>
                <span>Use common sense — if you wouldn't say it at a memorial service, it probably doesn't belong here</span>
              </li>
            </ul>
          </div>
        </section>

        {/* AI Features */}
        <section className="bg-white py-16">
          <div className="max-w-3xl mx-auto px-6 space-y-6">
            <div className="flex items-center gap-3">
              <Sparkles className="size-6 text-theme-primary flex-shrink-0" />
              <h2 className="text-neutral-900">AI Features & Usage Limits</h2>
            </div>
            <p className="text-neutral-700 leading-relaxed">
              Mosaic Life includes AI-powered features like story prompts and conversational personas that help
              bring stories to life. Running these features costs real money, so there are limits on how much
              AI you can use for free.
            </p>
            <Card className="p-6 bg-theme-accent-light/50 border-theme-accent space-y-4">
              <div className="flex items-start gap-3">
                <CreditCard className="size-5 text-theme-primary flex-shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <p className="text-neutral-700 font-medium">Current limits</p>
                  <p className="text-neutral-600 text-sm leading-relaxed">
                    Free usage is capped to keep costs sustainable. Once we introduce a way for users to
                    purchase AI credits, you'll be welcome to use as much AI as the tier or amount you choose
                    to support. We'll always be transparent about what's included and what costs extra.
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </section>

        {/* AI Personas */}
        <section className="py-16">
          <div className="max-w-3xl mx-auto px-6 space-y-6">
            <div className="flex items-center gap-3">
              <MessageCircle className="size-6 text-theme-primary flex-shrink-0" />
              <h2 className="text-neutral-900">AI Personas</h2>
            </div>
            <p className="text-neutral-700 leading-relaxed">
              Our AI personas are designed to help you explore and reflect on the stories shared about someone.
              We use guardrails to keep these conversations respectful and appropriate, but no system is perfect.
            </p>
            <ul className="space-y-3 text-neutral-700">
              <li className="flex gap-3">
                <span className="text-theme-primary font-medium">•</span>
                <span>
                  If a persona says something you don't like or find inaccurate, you can start a new conversation
                  or simply choose not to use the persona feature
                </span>
              </li>
              <li className="flex gap-3">
                <span className="text-theme-primary font-medium">•</span>
                <span>
                  If someone deliberately works around our safety controls, that's on them — not us. We do our
                  best, but we can't guarantee perfection
                </span>
              </li>
              <li className="flex gap-3">
                <span className="text-theme-primary font-medium">•</span>
                <span>
                  If you have constructive feedback on how to improve the personas, we genuinely want to hear it.
                  Reach out anytime
                </span>
              </li>
            </ul>
          </div>
        </section>

        {/* Media & Content */}
        <section className="bg-white py-16">
          <div className="max-w-3xl mx-auto px-6 space-y-6">
            <div className="flex items-center gap-3">
              <Camera className="size-6 text-theme-primary flex-shrink-0" />
              <h2 className="text-neutral-900">Your Content & Media</h2>
            </div>
            <p className="text-neutral-700 leading-relaxed">
              You own the content you create on Mosaic Life — your stories, photos, and other media belong
              to you. By uploading content, you grant us permission to host and display it as part of the
              platform's functionality, but we don't claim ownership of your work.
            </p>
            <p className="text-neutral-700 leading-relaxed">
              That said, everything you upload should be respectful and must not violate anyone's personal rights
              or any local, state, or federal laws. This includes but isn't limited to:
            </p>
            <ul className="space-y-3 text-neutral-700">
              <li className="flex gap-3">
                <span className="text-theme-primary font-medium">•</span>
                <span>No content that violates copyright or intellectual property rights</span>
              </li>
              <li className="flex gap-3">
                <span className="text-theme-primary font-medium">•</span>
                <span>No explicit, obscene, or pornographic material</span>
              </li>
              <li className="flex gap-3">
                <span className="text-theme-primary font-medium">•</span>
                <span>No content that promotes violence or illegal activity</span>
              </li>
              <li className="flex gap-3">
                <span className="text-theme-primary font-medium">•</span>
                <span>No photos or media of people shared without their consent (or the consent of their family, in the case of a memorial)</span>
              </li>
            </ul>
          </div>
        </section>

        {/* Content Moderation */}
        <section className="py-16">
          <div className="max-w-3xl mx-auto px-6 space-y-6">
            <div className="flex items-center gap-3">
              <Shield className="size-6 text-theme-primary flex-shrink-0" />
              <h2 className="text-neutral-900">Content Moderation</h2>
            </div>
            <p className="text-neutral-700 leading-relaxed">
              Let's be honest: this is a platform built and maintained by a single developer. We cannot actively
              monitor or police all content on the site. Here's how we handle things:
            </p>
            <ul className="space-y-3 text-neutral-700">
              <li className="flex gap-3">
                <span className="text-theme-primary font-medium">•</span>
                <span>We do not proactively review all content posted to the platform</span>
              </li>
              <li className="flex gap-3">
                <span className="text-theme-primary font-medium">•</span>
                <span>If an issue is reported to us, we will investigate and take action if necessary</span>
              </li>
              <li className="flex gap-3">
                <span className="text-theme-primary font-medium">•</span>
                <span>
                  For significant violations, action may include removing content, suspending accounts,
                  or permanently banning users from the platform
                </span>
              </li>
              <li className="flex gap-3">
                <span className="text-theme-primary font-medium">•</span>
                <span>We reserve the right to remove any content that we determine violates these terms</span>
              </li>
            </ul>
          </div>
        </section>

        {/* Liability */}
        <section className="bg-white py-16">
          <div className="max-w-3xl mx-auto px-6 space-y-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="size-6 text-theme-primary flex-shrink-0" />
              <h2 className="text-neutral-900">Limitation of Liability</h2>
            </div>
            <p className="text-neutral-700 leading-relaxed">
              Mosaic Life is provided "as is" without warranties of any kind. While we do our best to keep
              the platform running smoothly and your data safe, we can't guarantee perfection. Specifically:
            </p>
            <ul className="space-y-3 text-neutral-700">
              <li className="flex gap-3">
                <span className="text-theme-primary font-medium">•</span>
                <span>
                  We are not liable for content posted by users. Users are responsible for what they share
                </span>
              </li>
              <li className="flex gap-3">
                <span className="text-theme-primary font-medium">•</span>
                <span>
                  We are not liable for AI-generated content, including persona conversations. AI can
                  sometimes produce unexpected or inaccurate results
                </span>
              </li>
              <li className="flex gap-3">
                <span className="text-theme-primary font-medium">•</span>
                <span>
                  We are not responsible for data loss, though we take reasonable steps to protect your content
                </span>
              </li>
              <li className="flex gap-3">
                <span className="text-theme-primary font-medium">•</span>
                <span>
                  We are not liable for any damages arising from your use of the platform
                </span>
              </li>
              <li className="flex gap-3">
                <span className="text-theme-primary font-medium">•</span>
                <span>
                  While we implement encryption, security reviews, and network controls to protect your
                  data, we cannot guarantee against all security breaches. If you are uncomfortable with
                  this risk, we encourage you to self-host your own instance for full control
                </span>
              </li>
            </ul>
            <Card className="p-6 border-amber-200 bg-amber-50 space-y-2">
              <p className="text-neutral-700 text-sm leading-relaxed">
                <strong>In plain terms:</strong> We're building something we believe in, and we'll do our best to
                make it great. But this is a project maintained by a sole developer, not a corporation with a
                legal department. By using Mosaic Life, you acknowledge and accept these limitations.
              </p>
            </Card>
          </div>
        </section>

        {/* Account & Termination */}
        <section className="py-16">
          <div className="max-w-3xl mx-auto px-6 space-y-6">
            <h2 className="text-neutral-900">Your Account</h2>
            <p className="text-neutral-700 leading-relaxed">
              You're responsible for keeping your account secure and for all activity that occurs under
              your account. If you suspect unauthorized access, let us know immediately.
            </p>
            <p className="text-neutral-700 leading-relaxed">
              We reserve the right to suspend or terminate accounts that violate these terms. You may
              also delete your account at any time. If you'd like your data removed, contact us and
              we'll take care of it.
            </p>
          </div>
        </section>

        {/* Open Source */}
        <section className="bg-white py-16">
          <div className="max-w-3xl mx-auto px-6 space-y-6">
            <h2 className="text-neutral-900">Open Source</h2>
            <p className="text-neutral-700 leading-relaxed">
              Mosaic Life is open source software released under the{' '}
              <a
                href="https://www.gnu.org/licenses/gpl-3.0.html"
                target="_blank"
                rel="noopener noreferrer"
                className="text-theme-primary hover:text-theme-primary-dark underline"
              >
                GNU General Public License v3.0 (GPLv3)
              </a>
              . This means you're free to use, modify, and host the code yourself — but any derivative work
              or modified version must also be released under the same license. These Terms of Service apply
              specifically to the hosted instance at mosaiclife.me. If you run your own instance, you're
              responsible for establishing your own terms and policies.
            </p>
          </div>
        </section>

        {/* Changes to Terms */}
        <section className="py-16">
          <div className="max-w-3xl mx-auto px-6 space-y-6">
            <h2 className="text-neutral-900">Changes to These Terms</h2>
            <p className="text-neutral-700 leading-relaxed">
              We may update these terms from time to time as the platform evolves. When we make significant
              changes, we'll do our best to let you know — but it's also a good idea to check back occasionally.
              Continued use of the platform after changes are posted constitutes acceptance of the updated terms.
            </p>
          </div>
        </section>

        {/* Contact */}
        <section className="bg-white py-16">
          <div className="max-w-3xl mx-auto px-6">
            <div className="text-center space-y-6">
              <h2 className="text-neutral-900">Questions or Concerns?</h2>
              <p className="text-neutral-600">
                If you have questions about these terms, feedback about the platform, or need to report
                a concern, we're always happy to hear from you.
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
