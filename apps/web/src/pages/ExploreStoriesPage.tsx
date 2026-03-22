import { FileText } from 'lucide-react';
import Footer from '@/components/Footer';

export default function ExploreStoriesPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 max-w-7xl mx-auto px-6 py-8 w-full">
        <div className="flex items-center gap-3 mb-6">
          <FileText className="size-6 text-theme-primary" />
          <h1 className="text-2xl font-serif font-medium">Explore Stories</h1>
        </div>
        <p className="text-neutral-500">
          Discover public stories shared by the community.
        </p>
      </div>
      <Footer />
    </div>
  );
}
