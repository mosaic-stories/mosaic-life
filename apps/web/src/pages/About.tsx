import { Users, Shield, Heart, Sparkles, Mail, Code } from 'lucide-react';
import { Card } from '@/components/ui/card';
import Footer from '@/components/Footer';
import { SEOHead } from '@/components/seo';

export default function About() {
  return (
    <div className="min-h-screen bg-theme-background transition-colors duration-300 flex flex-col">
      <SEOHead
        title="About Mosaic Life"
        description="Learn about Mosaic Life and our mission to preserve meaningful stories and memories. Built by a family honoring their mother, Karen Hewitt."
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
              Mosaic Life was born from a deeply personal experience: the loss of a loved one and the
              urgent realization that memories fade faster than we expect. What started as one
              family's need to preserve their mother's story became a platform for everyone.
            </p>
          </div>
        </section>

        {/* Origin Story */}
        <section className="bg-white py-20">
          <div className="max-w-7xl mx-auto px-6">
            <div className="max-w-3xl mx-auto space-y-12">
              <div className="text-center space-y-4">
                <h2 className="text-neutral-900">How It Started</h2>
              </div>

              <div className="space-y-6">
                <p className="text-neutral-700 leading-relaxed">
                  In the summer of 2025, Joe Hewitt lost his mother, Karen Hewitt — one of the most
                  amazing human beings he's ever known. Her passing came during a period of significant
                  loss throughout the family, with several other loved ones lost in a relatively short time.
                </p>
                <p className="text-neutral-700 leading-relaxed">
                  With each loss came the same realization: memories were already starting to blur. The
                  little details — her laugh, the stories she'd tell, the way she made everyone feel
                  welcome — were scattered across the minds of family and friends, and time was slowly
                  wearing them away. There was an urgency to capture as much as possible before years
                  caused those details to fade for good.
                </p>
                <p className="text-neutral-700 leading-relaxed">
                  With the rise of AI capabilities and AI-assisted development, the timing was right.
                  What if there was a platform where families and friends could collectively capture rich
                  memories of their loved ones — and preserve them forever? Where AI could help build a
                  knowledge base and map the connections between people and memories, creating something
                  far richer than any single person could assemble alone?
                </p>
                <p className="text-neutral-700 leading-relaxed">
                  That idea felt like a game changer. So Joe started building Mosaic Life.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* The Team */}
        <section className="py-20">
          <div className="max-w-7xl mx-auto px-6">
            <div className="max-w-4xl mx-auto space-y-12">
              <div className="text-center space-y-4">
                <h2 className="text-neutral-900">The People Behind Mosaic Life</h2>
                <p className="text-neutral-600 text-lg">
                  This isn't a corporate venture — it's a family project built with heart.
                </p>
              </div>

              <div className="grid md:grid-cols-3 gap-6">
                <Card className="p-6 space-y-4">
                  <div className="space-y-2">
                    <h3 className="text-neutral-900">Joe Hewitt</h3>
                    <p className="text-sm text-theme-primary font-medium">Creator & Developer</p>
                    <p className="text-sm text-neutral-600 leading-relaxed">
                      DevOps Architect turned platform builder. Joe designed and built Mosaic
                      Life from the ground up, driven by the need to preserve his mother's memory and
                      help others do the same. Supported by his loving wife Kristen and two amazing
                      kids, Jacob and Kayla, who provide inspiration and insights throughout this journey.
                    </p>
                  </div>
                </Card>

                <Card className="p-6 space-y-4">
                  <div className="space-y-2">
                    <h3 className="text-neutral-900">Jeremy Hewitt</h3>
                    <p className="text-sm text-theme-primary font-medium">Co-Builder</p>
                    <p className="text-sm text-neutral-600 leading-relaxed">
                      A data engineer and natural problem solver, Jeremy brings analytical depth
                      to the platform. His attentive listening skills are what we strive to achieve
                      with our AI personas — truly hearing people and drawing out what matters most.
                    </p>
                  </div>
                </Card>

                <Card className="p-6 space-y-4">
                  <div className="space-y-2">
                    <h3 className="text-neutral-900">Jay Hewitt</h3>
                    <p className="text-sm text-theme-primary font-medium">Advisor</p>
                    <p className="text-sm text-neutral-600 leading-relaxed">
                      A lifetime builder and creator in construction services, Jay brings that same
                      hands-on spirit to this platform. He and Karen were each other's biggest
                      supporters through 50 years of marriage — values they instilled in their family.
                      Jay's perspective helps shape how Mosaic Life can keep someone's memory with us
                      forever.
                    </p>
                  </div>
                </Card>
              </div>

              <Card className="p-8 bg-gradient-to-br from-theme-gradient-from to-theme-gradient-to border-theme-accent">
                <p className="text-neutral-700 text-center text-lg leading-relaxed italic">
                  Mosaic Life is built and maintained in honor of Karen Hewitt. We hope everyone gets a
                  chance to honor their loved ones with the help of this platform.
                </p>
              </Card>
            </div>
          </div>
        </section>

        {/* Mission Section */}
        <section className="bg-white py-20">
          <div className="max-w-7xl mx-auto px-6">
            <div className="max-w-3xl mx-auto space-y-12">
              <div className="text-center space-y-4">
                <h2 className="text-neutral-900">Our Mission</h2>
                <p className="text-neutral-600 text-lg">
                  We believe that every person's story deserves to be told, remembered, and celebrated — not just
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
                  We've seen firsthand how powerful it is when multiple people contribute their perspectives — how
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
                    a friend, a colleague, a student — each holds unique pieces of the picture. When these
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
                  Our AI features are designed to be helpful companions in your storytelling journey — not
                  replacements for human connection.
                </p>
              </div>

              <div className="space-y-6">
                <p className="text-neutral-700 leading-relaxed">
                  AI helps prompt memories you might have forgotten, suggests questions that draw out deeper
                  stories, organizes contributions from multiple people, and builds a knowledge base that
                  maps the connections between people and their shared memories. It can even help those
                  who find writing difficult to express their thoughts clearly.
                </p>
                <p className="text-neutral-700 leading-relaxed">
                  But the heart of every Legacy on Mosaic Life is always the authentic human stories shared
                  by real people. AI is a tool that makes storytelling more accessible, not a shortcut that
                  diminishes its meaning.
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

        {/* Open Source */}
        <section className="bg-white py-20">
          <div className="max-w-7xl mx-auto px-6">
            <div className="max-w-3xl mx-auto space-y-6">
              <div className="flex items-center justify-center gap-2">
                <Code className="size-6 text-theme-primary" />
                <h2 className="text-neutral-900">Open Source</h2>
              </div>
              <p className="text-neutral-700 leading-relaxed text-center">
                Mosaic Life is fully open source. We believe that a platform built to preserve what matters
                most should itself be transparent and accessible to everyone. You're free to inspect the
                code, contribute improvements, or host your own instance for your family or community.
              </p>
            </div>
          </div>
        </section>

        {/* Contact Section */}
        <section className="bg-white py-20">
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
