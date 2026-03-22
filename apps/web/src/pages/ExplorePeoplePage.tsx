import { Users } from 'lucide-react';

export default function ExplorePeoplePage() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Users className="size-6 text-theme-primary" />
        <h1 className="text-2xl font-serif font-medium">Explore People</h1>
      </div>
      <p className="text-neutral-500">
        Find and connect with people in the community.
      </p>
    </div>
  );
}
