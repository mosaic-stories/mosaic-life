import Footer from '@/components/Footer';
import { SEOHead } from '@/components/seo';
import { HeroSection } from './HeroSection';
import { GettingStartedSteps } from './GettingStartedSteps';
import { CoreFeaturesList } from './CoreFeaturesList';
import { UseCasesGrid } from './UseCasesGrid';
import { AIAgentSection } from './AIAgentSection';
import { AIPersonasSection } from './AIPersonasSection';
import { CommunitySection } from './CommunitySection';
import { CTASection } from './CTASection';

export default function HowItWorks() {
  return (
    <div className="min-h-screen bg-[rgb(var(--theme-background))] transition-colors duration-300 flex flex-col">
      <SEOHead
        title="How It Works"
        description="Discover how Mosaic Life helps you create beautiful digital tributes. Learn about our story creation tools, AI assistance, media galleries, and collaborative features."
        path="/how-it-works"
      />
      <main className="flex-1">
        <HeroSection />
        <GettingStartedSteps />
        <CoreFeaturesList />
        <UseCasesGrid />
        <AIAgentSection />
        <AIPersonasSection />
        <CommunitySection />
        <CTASection />
      </main>

      <Footer />
    </div>
  );
}
