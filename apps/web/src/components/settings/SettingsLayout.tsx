/**
 * Settings page layout with sidebar navigation.
 */

import { ChevronLeft, Palette, Settings, User, BarChart3, Shield } from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';

import { cn } from '@/components/ui/utils';
import { SEOHead } from '@/components/seo';

const sidebarItems = [
  { path: 'profile', label: 'Profile', icon: User },
  { path: 'appearance', label: 'Appearance', icon: Palette },
  { path: 'ai', label: 'AI Preferences', icon: Settings },
  { path: 'usage', label: 'Usage & Stats', icon: BarChart3 },
  { path: 'account', label: 'Account', icon: Shield },
];

export default function SettingsLayout() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[rgb(var(--theme-background))]">
      <SEOHead
        title="Settings"
        description="Manage your account settings and preferences"
        noIndex={true}
      />
      {/* Header */}
      <div className="border-b border-[rgb(var(--theme-primary))]/10 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ChevronLeft className="size-4" />
            Back
          </button>
          <h1 className="text-xl font-semibold text-gray-900">Settings</h1>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex gap-8">
          {/* Sidebar */}
          <nav className="w-56 shrink-0">
            <ul className="space-y-1">
              {sidebarItems.map((item) => (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-[rgb(var(--theme-primary))]/10 text-[rgb(var(--theme-primary))]'
                          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                      )
                    }
                  >
                    <item.icon className="size-4" />
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>

          {/* Content */}
          <main className="flex-1 min-w-0">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
