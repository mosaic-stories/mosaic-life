import { Image } from 'lucide-react';

export default function MyMediaPage() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Image className="size-6 text-theme-primary" />
        <h1 className="text-2xl font-serif font-medium">My Media</h1>
      </div>
      <p className="text-neutral-500">
        Your media across all legacies will appear here.
      </p>
    </div>
  );
}
