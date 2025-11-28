import { BookHeart, Mail } from 'lucide-react';

interface FooterProps {
  onNavigate: (view: string) => void;
}

export default function Footer({ onNavigate }: FooterProps) {
  return (
    <footer className="bg-white border-t mt-auto">
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {/* Column 1 - Brand */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <BookHeart className="size-6 text-[rgb(var(--theme-primary))]" />
              <span className="tracking-tight text-neutral-900">Mosaic Life</span>
            </div>
            <p className="text-sm text-neutral-600">
              Honoring lives through shared stories
            </p>
          </div>

          {/* Column 2 - Platform */}
          <div className="space-y-4">
            <h4 className="text-sm text-neutral-900">Platform</h4>
            <ul className="space-y-3 text-sm">
              <li>
                <button
                  onClick={() => onNavigate('story')}
                  className="text-neutral-600 hover:text-neutral-900 transition-colors"
                >
                  Create a Legacy
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('home')}
                  className="text-neutral-600 hover:text-neutral-900 transition-colors"
                >
                  Explore Legacies
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('community')}
                  className="text-neutral-600 hover:text-neutral-900 transition-colors"
                >
                  Community
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('how-it-works')}
                  className="text-neutral-600 hover:text-neutral-900 transition-colors"
                >
                  How It Works
                </button>
              </li>
            </ul>
          </div>

          {/* Column 3 - Company */}
          <div className="space-y-4">
            <h4 className="text-sm text-neutral-900">Company</h4>
            <ul className="space-y-3 text-sm">
              <li>
                <button
                  onClick={() => onNavigate('about')}
                  className="text-neutral-600 hover:text-neutral-900 transition-colors"
                >
                  About Us
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('contact')}
                  className="text-neutral-600 hover:text-neutral-900 transition-colors"
                >
                  Contact
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('privacy')}
                  className="text-neutral-600 hover:text-neutral-900 transition-colors"
                >
                  Privacy Policy
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('terms')}
                  className="text-neutral-600 hover:text-neutral-900 transition-colors"
                >
                  Terms of Service
                </button>
              </li>
            </ul>
          </div>

          {/* Column 4 - Connect */}
          <div className="space-y-4">
            <h4 className="text-sm text-neutral-900">Connect</h4>
            <ul className="space-y-3 text-sm">
              <li>
                <a
                  href="mailto:support@mosaiclife.me"
                  className="text-neutral-600 hover:text-neutral-900 transition-colors flex items-center gap-2"
                >
                  <Mail className="size-4" />
                  support@mosaiclife.me
                </a>
              </li>
            </ul>
            {/* Social media placeholder for future */}
            <div className="flex items-center gap-3 pt-2">
              <div className="size-8 rounded-full bg-neutral-100 hover:bg-neutral-200 transition-colors cursor-pointer flex items-center justify-center">
                <span className="text-xs text-neutral-400">X</span>
              </div>
              <div className="size-8 rounded-full bg-neutral-100 hover:bg-neutral-200 transition-colors cursor-pointer flex items-center justify-center">
                <span className="text-xs text-neutral-400">Li</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-8 border-t border-neutral-200 flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-neutral-500">
          <p>© 2025 Mosaic Life. All rights reserved.</p>
          <p className="text-neutral-400">mosaiclife.me</p>
        </div>
      </div>
    </footer>
  );
}
