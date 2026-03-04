import { Link2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import Footer from '@/components/Footer';

export default function ConnectionsPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-4 px-6">
          <Link2 className="size-16 mx-auto text-neutral-300" />
          <h1 className="text-2xl font-bold text-neutral-900">Connections</h1>
          <p className="text-neutral-600 max-w-md">
            Your personas, people, and conversations.
          </p>
          <Link
            to="/"
            className="inline-block text-sm text-theme-primary hover:underline"
          >
            Go to Home
          </Link>
        </div>
      </div>
      <Footer />
    </div>
  );
}
