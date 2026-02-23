/**
 * Appearance settings section with theme selection.
 */

import { Check } from 'lucide-react';

import { cn } from '@/components/ui/utils';
import { themes } from '@/lib/themes';
import { applyTheme, themeColors } from '@/lib/themeUtils';
import { usePreferences, useUpdatePreferences } from '@/features/settings/hooks/useSettings';

type ThemeCategory = 'classic' | 'muted' | 'vibrant';

const themesByCategory: Record<ThemeCategory, typeof themes> = {
  classic: themes.filter((t) => t.category === 'classic'),
  muted: themes.filter((t) => t.category === 'muted'),
  vibrant: themes.filter((t) => t.category === 'vibrant'),
};

const categoryLabels: Record<ThemeCategory, string> = {
  classic: 'Classic',
  muted: 'Muted',
  vibrant: 'Vibrant',
};

export default function AppearanceSettings() {
  const { data: preferences, isLoading } = usePreferences();
  const updatePreferences = useUpdatePreferences();

  const currentTheme = preferences?.theme || 'warm-amber';

  const handleThemeChange = (themeId: string) => {
    // Apply immediately for instant feedback
    applyTheme(themeId);
    localStorage.setItem('mosaic-theme', themeId);

    // Persist to backend
    updatePreferences.mutate(
      { theme: themeId },
      {
        onError: (error) => {
          console.error('Failed to save theme preference:', error);
          // Theme is already applied visually and in localStorage, so no rollback needed
          // The next page load will use localStorage while the user can try again
        },
      }
    );
  };

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 rounded w-1/4"></div>
        <div className="h-48 bg-gray-200 rounded"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Appearance</h2>
        <p className="text-sm text-gray-500">
          Customize how Mosaic Life looks for you
        </p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
        <h3 className="text-sm font-medium text-gray-700">Theme</h3>

        {(Object.keys(themesByCategory) as ThemeCategory[]).map((category) => (
          <div key={category}>
            <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
              {categoryLabels[category]}
            </h4>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
              {themesByCategory[category].map((theme) => {
                const colors = themeColors[theme.id as keyof typeof themeColors];
                return (
                  <button
                    key={theme.id}
                    onClick={() => handleThemeChange(theme.id)}
                    className={cn(
                      'relative flex flex-col items-center p-3 rounded-lg border-2 transition-all',
                      currentTheme === theme.id
                        ? 'border-theme-primary bg-theme-primary/5'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    )}
                  >
                    {/* Color swatch */}
                    <div
                      className="w-10 h-10 rounded-full mb-2 shadow-sm"
                      style={{
                        background: `linear-gradient(135deg, rgb(${colors.primary}) 0%, rgb(${colors.accent}) 100%)`,
                      }}
                    />

                    {/* Theme name */}
                    <span className="text-xs font-medium text-gray-700 text-center">
                      {theme.name}
                    </span>

                    {/* Checkmark */}
                    {currentTheme === theme.id && (
                      <div className="absolute top-1 right-1 size-4 bg-theme-primary rounded-full flex items-center justify-center">
                        <Check className="size-3 text-white" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <p className="text-sm text-gray-500">
          Theme applies immediately and syncs to your account
        </p>
      </div>
    </div>
  );
}
