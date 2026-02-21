import { Sparkles } from 'lucide-react';

export function HeroSection() {
  return (
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
  );
}
