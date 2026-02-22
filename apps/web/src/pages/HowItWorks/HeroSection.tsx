import { Sparkles } from 'lucide-react';

export function HeroSection() {
  return (
    <section className="max-w-5xl mx-auto px-6 py-16">
      <div className="text-center space-y-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-theme-accent-light border border-theme-accent">
          <Sparkles className="size-4 text-theme-primary" />
          <span className="text-sm text-theme-primary-dark">Platform Overview</span>
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
  );
}
