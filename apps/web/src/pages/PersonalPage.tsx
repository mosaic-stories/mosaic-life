import { User } from 'lucide-react';

export default function PersonalPage() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-center gap-3 mb-6">
        <User className="size-6 text-theme-primary" />
        <h1 className="text-2xl font-serif font-medium">Personal</h1>
      </div>
      <p className="text-neutral-500">
        Your stats and personal dashboard will appear here.
      </p>
    </div>
  );
}
