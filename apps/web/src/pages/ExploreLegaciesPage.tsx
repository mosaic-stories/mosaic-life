import { BookOpen } from 'lucide-react';

export default function ExploreLegaciesPage() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-center gap-3 mb-6">
        <BookOpen className="size-6 text-theme-primary" />
        <h1 className="text-2xl font-serif font-medium">Explore Legacies</h1>
      </div>
      <p className="text-neutral-500">
        Discover public legacies and stories from the community.
      </p>
    </div>
  );
}
