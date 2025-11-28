import { Check, Palette } from 'lucide-react';
import { Button } from './ui/button';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { themes } from '../lib/themes';

interface ThemeSelectorProps {
  currentTheme: string;
  onThemeChange: (themeId: string) => void;
}

export default function ThemeSelector({ currentTheme, onThemeChange }: ThemeSelectorProps) {
  const getThemePreviewColor = (themeId: string) => {
    switch (themeId) {
      // Classic themes
      case 'warm-amber':
        return 'bg-gradient-to-br from-amber-400 to-orange-500';
      case 'serene-blue':
        return 'bg-gradient-to-br from-blue-400 to-sky-500';
      case 'gentle-rose':
        return 'bg-gradient-to-br from-rose-400 to-pink-500';
      case 'forest-green':
        return 'bg-gradient-to-br from-emerald-400 to-teal-500';
      case 'twilight-purple':
        return 'bg-gradient-to-br from-purple-400 to-indigo-500';
      case 'deep-navy':
        return 'bg-gradient-to-br from-blue-900 to-blue-600';
      
      // Muted themes
      case 'muted-sage':
        return 'bg-gradient-to-br from-stone-400 to-slate-400';
      case 'muted-lavender':
        return 'bg-gradient-to-br from-violet-300 to-slate-300';
      case 'muted-seafoam':
        return 'bg-gradient-to-br from-teal-300 to-slate-300';
      case 'muted-clay':
        return 'bg-gradient-to-br from-orange-400 to-stone-400';
      
      // Vibrant themes
      case 'vibrant-coral':
        return 'bg-gradient-to-br from-rose-400 to-pink-400';
      case 'vibrant-ocean':
        return 'bg-gradient-to-br from-sky-400 to-cyan-400';
      case 'vibrant-sunset':
        return 'bg-gradient-to-br from-orange-400 to-rose-400';
      case 'vibrant-lime':
        return 'bg-gradient-to-br from-lime-400 to-green-400';
      case 'navy-gradient':
        return 'bg-gradient-to-br from-blue-900 to-blue-500';
      
      default:
        return 'bg-gradient-to-br from-amber-400 to-orange-500';
    }
  };

  const classicThemes = themes.filter(t => t.category === 'classic');
  const mutedThemes = themes.filter(t => t.category === 'muted');
  const vibrantThemes = themes.filter(t => t.category === 'vibrant');

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <Palette className="size-4" />
          <span className="hidden md:inline">Theme</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 max-h-[600px] overflow-y-auto" align="end">
        <div className="space-y-4">
          <div className="space-y-2">
            <h3 className="text-neutral-900">Choose a theme</h3>
            <p className="text-sm text-neutral-600">
              Select a color mood that feels right for your tribute
            </p>
          </div>

          {/* Classic Themes */}
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wider text-neutral-500">Classic</p>
            {classicThemes.map((theme) => (
              <button
                key={theme.id}
                onClick={() => onThemeChange(theme.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all ${
                  currentTheme === theme.id
                    ? 'border-neutral-900 bg-neutral-50 shadow-sm'
                    : 'border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'
                }`}
              >
                <div className={`size-10 rounded-lg ${getThemePreviewColor(theme.id)} flex-shrink-0`} />
                <div className="flex-1 text-left">
                  <p className="text-neutral-900">{theme.name}</p>
                  <p className="text-sm text-neutral-500">{theme.description}</p>
                </div>
                {currentTheme === theme.id && (
                  <Check className="size-5 text-neutral-900 flex-shrink-0" />
                )}
              </button>
            ))}
          </div>

          {/* Muted Themes */}
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wider text-neutral-500">Muted</p>
            {mutedThemes.map((theme) => (
              <button
                key={theme.id}
                onClick={() => onThemeChange(theme.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all ${
                  currentTheme === theme.id
                    ? 'border-neutral-900 bg-neutral-50 shadow-sm'
                    : 'border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'
                }`}
              >
                <div className={`size-10 rounded-lg ${getThemePreviewColor(theme.id)} flex-shrink-0`} />
                <div className="flex-1 text-left">
                  <p className="text-neutral-900">{theme.name}</p>
                  <p className="text-sm text-neutral-500">{theme.description}</p>
                </div>
                {currentTheme === theme.id && (
                  <Check className="size-5 text-neutral-900 flex-shrink-0" />
                )}
              </button>
            ))}
          </div>

          {/* Vibrant Themes */}
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wider text-neutral-500">Vibrant</p>
            {vibrantThemes.map((theme) => (
              <button
                key={theme.id}
                onClick={() => onThemeChange(theme.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all ${
                  currentTheme === theme.id
                    ? 'border-neutral-900 bg-neutral-50 shadow-sm'
                    : 'border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'
                }`}
              >
                <div className={`size-10 rounded-lg ${getThemePreviewColor(theme.id)} flex-shrink-0`} />
                <div className="flex-1 text-left">
                  <p className="text-neutral-900">{theme.name}</p>
                  <p className="text-sm text-neutral-500">{theme.description}</p>
                </div>
                {currentTheme === theme.id && (
                  <Check className="size-5 text-neutral-900 flex-shrink-0" />
                )}
              </button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}