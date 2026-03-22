import { FileText } from 'lucide-react';

export default function ExploreStoriesPage() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-center gap-3 mb-6">
        <FileText className="size-6 text-theme-primary" />
        <h1 className="text-2xl font-serif font-medium">Explore Stories</h1>
      </div>
      <p className="text-neutral-500">
        Discover public stories shared by the community.
      </p>
    </div>
  );
}
