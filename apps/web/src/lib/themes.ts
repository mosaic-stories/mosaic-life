export interface Theme {
  id: string;
  name: string;
  description: string;
  category?: 'classic' | 'muted' | 'vibrant';
  colors: {
    primary: string;
    primaryLight: string;
    primaryDark: string;
    accent: string;
    accentLight: string;
    surface: string;
    surfaceHover: string;
  };
}

export const themes: Theme[] = [
  // Classic themes
  {
    id: 'warm-amber',
    name: 'Warm Amber',
    description: 'Hopeful and welcoming',
    category: 'classic',
    colors: {
      primary: 'bg-amber-600',
      primaryLight: 'bg-amber-50',
      primaryDark: 'bg-amber-700',
      accent: 'border-amber-200',
      accentLight: 'bg-amber-100',
      surface: 'bg-amber-50',
      surfaceHover: 'hover:border-amber-300'
    }
  },
  {
    id: 'serene-blue',
    name: 'Serene Blue',
    description: 'Calm and peaceful',
    category: 'classic',
    colors: {
      primary: 'bg-blue-600',
      primaryLight: 'bg-blue-50',
      primaryDark: 'bg-blue-700',
      accent: 'border-blue-200',
      accentLight: 'bg-blue-100',
      surface: 'bg-blue-50',
      surfaceHover: 'hover:border-blue-300'
    }
  },
  {
    id: 'gentle-rose',
    name: 'Gentle Rose',
    description: 'Soft and loving',
    category: 'classic',
    colors: {
      primary: 'bg-rose-600',
      primaryLight: 'bg-rose-50',
      primaryDark: 'bg-rose-700',
      accent: 'border-rose-200',
      accentLight: 'bg-rose-100',
      surface: 'bg-rose-50',
      surfaceHover: 'hover:border-rose-300'
    }
  },
  {
    id: 'forest-green',
    name: 'Forest Green',
    description: 'Natural and grounded',
    category: 'classic',
    colors: {
      primary: 'bg-emerald-600',
      primaryLight: 'bg-emerald-50',
      primaryDark: 'bg-emerald-700',
      accent: 'border-emerald-200',
      accentLight: 'bg-emerald-100',
      surface: 'bg-emerald-50',
      surfaceHover: 'hover:border-emerald-300'
    }
  },
  {
    id: 'twilight-purple',
    name: 'Twilight Purple',
    description: 'Contemplative and spiritual',
    category: 'classic',
    colors: {
      primary: 'bg-purple-600',
      primaryLight: 'bg-purple-50',
      primaryDark: 'bg-purple-700',
      accent: 'border-purple-200',
      accentLight: 'bg-purple-100',
      surface: 'bg-purple-50',
      surfaceHover: 'hover:border-purple-300'
    }
  },
  {
    id: 'deep-navy',
    name: 'Deep Navy',
    description: 'Professional and trustworthy',
    category: 'classic',
    colors: {
      primary: 'bg-blue-900',
      primaryLight: 'bg-slate-100',
      primaryDark: 'bg-slate-900',
      accent: 'border-blue-300',
      accentLight: 'bg-blue-100',
      surface: 'bg-slate-50',
      surfaceHover: 'hover:border-blue-400'
    }
  },
  // Muted themes
  {
    id: 'muted-sage',
    name: 'Muted Sage',
    description: 'Subtle and sophisticated',
    category: 'muted',
    colors: {
      primary: 'bg-stone-500',
      primaryLight: 'bg-stone-50',
      primaryDark: 'bg-stone-600',
      accent: 'border-stone-300',
      accentLight: 'bg-stone-100',
      surface: 'bg-stone-50',
      surfaceHover: 'hover:border-stone-400'
    }
  },
  {
    id: 'muted-lavender',
    name: 'Muted Lavender',
    description: 'Gentle and refined',
    category: 'muted',
    colors: {
      primary: 'bg-violet-500',
      primaryLight: 'bg-slate-50',
      primaryDark: 'bg-violet-600',
      accent: 'border-violet-200',
      accentLight: 'bg-violet-100',
      surface: 'bg-slate-50',
      surfaceHover: 'hover:border-violet-300'
    }
  },
  {
    id: 'muted-seafoam',
    name: 'Muted Seafoam',
    description: 'Cool and understated',
    category: 'muted',
    colors: {
      primary: 'bg-teal-500',
      primaryLight: 'bg-slate-50',
      primaryDark: 'bg-teal-600',
      accent: 'border-teal-200',
      accentLight: 'bg-teal-100',
      surface: 'bg-slate-50',
      surfaceHover: 'hover:border-teal-300'
    }
  },
  {
    id: 'muted-clay',
    name: 'Muted Clay',
    description: 'Earthy and warm',
    category: 'muted',
    colors: {
      primary: 'bg-orange-600',
      primaryLight: 'bg-stone-50',
      primaryDark: 'bg-orange-700',
      accent: 'border-orange-200',
      accentLight: 'bg-orange-100',
      surface: 'bg-stone-50',
      surfaceHover: 'hover:border-orange-300'
    }
  },
  // Vibrant themes
  {
    id: 'vibrant-coral',
    name: 'Vibrant Coral',
    description: 'Bold and energetic',
    category: 'vibrant',
    colors: {
      primary: 'bg-rose-500',
      primaryLight: 'bg-rose-50',
      primaryDark: 'bg-rose-600',
      accent: 'border-rose-300',
      accentLight: 'bg-rose-100',
      surface: 'bg-rose-50',
      surfaceHover: 'hover:border-rose-400'
    }
  },
  {
    id: 'vibrant-ocean',
    name: 'Vibrant Ocean',
    description: 'Bright and refreshing',
    category: 'vibrant',
    colors: {
      primary: 'bg-sky-500',
      primaryLight: 'bg-sky-50',
      primaryDark: 'bg-sky-600',
      accent: 'border-sky-300',
      accentLight: 'bg-sky-100',
      surface: 'bg-sky-50',
      surfaceHover: 'hover:border-sky-400'
    }
  },
  {
    id: 'vibrant-sunset',
    name: 'Vibrant Sunset',
    description: 'Warm and lively',
    category: 'vibrant',
    colors: {
      primary: 'bg-orange-500',
      primaryLight: 'bg-orange-50',
      primaryDark: 'bg-orange-600',
      accent: 'border-orange-300',
      accentLight: 'bg-orange-100',
      surface: 'bg-orange-50',
      surfaceHover: 'hover:border-orange-400'
    }
  },
  {
    id: 'vibrant-lime',
    name: 'Vibrant Lime',
    description: 'Fresh and dynamic',
    category: 'vibrant',
    colors: {
      primary: 'bg-lime-600',
      primaryLight: 'bg-lime-50',
      primaryDark: 'bg-lime-700',
      accent: 'border-lime-300',
      accentLight: 'bg-lime-100',
      surface: 'bg-lime-50',
      surfaceHover: 'hover:border-lime-400'
    }
  },
  {
    id: 'navy-gradient',
    name: 'Navy Gradient',
    description: 'Bold navy to bright blue',
    category: 'vibrant',
    colors: {
      primary: 'bg-blue-900',
      primaryLight: 'bg-blue-50',
      primaryDark: 'bg-slate-900',
      accent: 'border-blue-400',
      accentLight: 'bg-blue-100',
      surface: 'bg-blue-50',
      surfaceHover: 'hover:border-blue-500'
    }
  }
];

// Helper function to get theme color classes
export const getThemeClasses = (themeId: string) => {
  const theme = themes.find(t => t.id === themeId) || themes[0];
  return {
    // Primary colors
    primary: theme.colors.primary,
    primaryText: themeId === 'warm-amber' ? 'text-amber-600' : 
                 themeId === 'serene-blue' ? 'text-blue-600' :
                 themeId === 'gentle-rose' ? 'text-rose-600' :
                 themeId === 'forest-green' ? 'text-emerald-600' :
                 themeId === 'twilight-purple' ? 'text-purple-600' :
                 themeId === 'deep-navy' ? 'text-blue-900' :
                 themeId === 'muted-sage' ? 'text-stone-600' :
                 themeId === 'muted-lavender' ? 'text-violet-600' :
                 themeId === 'muted-seafoam' ? 'text-teal-600' :
                 themeId === 'muted-clay' ? 'text-orange-700' :
                 themeId === 'vibrant-coral' ? 'text-rose-600' :
                 themeId === 'vibrant-ocean' ? 'text-sky-600' :
                 themeId === 'vibrant-sunset' ? 'text-orange-600' :
                 themeId === 'vibrant-lime' ? 'text-lime-700' :
                 themeId === 'navy-gradient' ? 'text-blue-900' :
                 'text-amber-600',
    primaryLight: theme.colors.primaryLight,
    primaryDark: theme.colors.primaryDark,
    
    // Accent colors
    accent: theme.colors.accent,
    accentLight: theme.colors.accentLight,
    accentText: themeId === 'warm-amber' ? 'text-amber-800' : 
                themeId === 'serene-blue' ? 'text-blue-800' :
                themeId === 'gentle-rose' ? 'text-rose-800' :
                themeId === 'forest-green' ? 'text-emerald-800' :
                themeId === 'twilight-purple' ? 'text-purple-800' :
                themeId === 'deep-navy' ? 'text-blue-950' :
                themeId === 'muted-sage' ? 'text-stone-800' :
                themeId === 'muted-lavender' ? 'text-violet-800' :
                themeId === 'muted-seafoam' ? 'text-teal-800' :
                themeId === 'muted-clay' ? 'text-orange-800' :
                themeId === 'vibrant-coral' ? 'text-rose-800' :
                themeId === 'vibrant-ocean' ? 'text-sky-800' :
                themeId === 'vibrant-sunset' ? 'text-orange-800' :
                themeId === 'vibrant-lime' ? 'text-lime-800' :
                themeId === 'navy-gradient' ? 'text-blue-950' :
                'text-amber-800',
    
    // Surface colors
    surface: theme.colors.surface,
    surfaceHover: theme.colors.surfaceHover,
    
    // Badge colors
    badgeStyle: themeId === 'warm-amber' ? 'bg-amber-50 text-amber-700 border-amber-200' : 
                themeId === 'serene-blue' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                themeId === 'gentle-rose' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                themeId === 'forest-green' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                themeId === 'twilight-purple' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                themeId === 'deep-navy' ? 'bg-blue-50 text-blue-900 border-blue-200' :
                themeId === 'muted-sage' ? 'bg-stone-50 text-stone-700 border-stone-200' :
                themeId === 'muted-lavender' ? 'bg-violet-50 text-violet-700 border-violet-200' :
                themeId === 'muted-seafoam' ? 'bg-teal-50 text-teal-700 border-teal-200' :
                themeId === 'muted-clay' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                themeId === 'vibrant-coral' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                themeId === 'vibrant-ocean' ? 'bg-sky-50 text-sky-700 border-sky-200' :
                themeId === 'vibrant-sunset' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                themeId === 'vibrant-lime' ? 'bg-lime-50 text-lime-700 border-lime-200' :
                themeId === 'navy-gradient' ? 'bg-blue-50 text-blue-900 border-blue-200' :
                'bg-amber-50 text-amber-700 border-amber-200',
    
    // Button focus
    buttonFocus: themeId === 'warm-amber' ? 'focus:border-amber-300 focus:ring-amber-100' : 
                 themeId === 'serene-blue' ? 'focus:border-blue-300 focus:ring-blue-100' :
                 themeId === 'gentle-rose' ? 'focus:border-rose-300 focus:ring-rose-100' :
                 themeId === 'forest-green' ? 'focus:border-emerald-300 focus:ring-emerald-100' :
                 themeId === 'twilight-purple' ? 'focus:border-purple-300 focus:ring-purple-100' :
                 themeId === 'deep-navy' ? 'focus:border-blue-400 focus:ring-blue-100' :
                 themeId === 'muted-sage' ? 'focus:border-stone-300 focus:ring-stone-100' :
                 themeId === 'muted-lavender' ? 'focus:border-violet-300 focus:ring-violet-100' :
                 themeId === 'muted-seafoam' ? 'focus:border-teal-300 focus:ring-teal-100' :
                 themeId === 'muted-clay' ? 'focus:border-orange-300 focus:ring-orange-100' :
                 themeId === 'vibrant-coral' ? 'focus:border-rose-300 focus:ring-rose-100' :
                 themeId === 'vibrant-ocean' ? 'focus:border-sky-300 focus:ring-sky-100' :
                 themeId === 'vibrant-sunset' ? 'focus:border-orange-300 focus:ring-orange-100' :
                 themeId === 'vibrant-lime' ? 'focus:border-lime-300 focus:ring-lime-100' :
                 themeId === 'navy-gradient' ? 'focus:border-blue-500 focus:ring-blue-100' :
                 'focus:border-amber-300 focus:ring-amber-100',
    
    // Gradient - Updated with vibrant colors
    gradient: themeId === 'warm-amber' ? 'from-amber-400 to-orange-500' : 
              themeId === 'serene-blue' ? 'from-blue-400 to-sky-400' :
              themeId === 'gentle-rose' ? 'from-rose-400 to-pink-400' :
              themeId === 'forest-green' ? 'from-emerald-400 to-teal-400' :
              themeId === 'twilight-purple' ? 'from-purple-500 to-indigo-400' :
              themeId === 'deep-navy' ? 'from-blue-900 to-blue-600' :
              themeId === 'muted-sage' ? 'from-stone-300 to-slate-300' :
              themeId === 'muted-lavender' ? 'from-violet-200 to-indigo-100' :
              themeId === 'muted-seafoam' ? 'from-teal-300 to-sky-200' :
              themeId === 'muted-clay' ? 'from-amber-400 to-yellow-400' :
              themeId === 'vibrant-coral' ? 'from-rose-400 to-fuchsia-500' :
              themeId === 'vibrant-ocean' ? 'from-cyan-500 to-blue-500' :
              themeId === 'vibrant-sunset' ? 'from-orange-400 to-rose-400' :
              themeId === 'vibrant-lime' ? 'from-lime-400 to-green-500' :
              themeId === 'navy-gradient' ? 'from-blue-900 to-blue-500' :
              'from-amber-400 to-orange-500',
    
    // Icon background
    iconBg: themeId === 'warm-amber' ? 'bg-amber-100' : 
            themeId === 'serene-blue' ? 'bg-blue-100' :
            themeId === 'gentle-rose' ? 'bg-rose-100' :
            themeId === 'forest-green' ? 'bg-emerald-100' :
            themeId === 'twilight-purple' ? 'bg-purple-100' :
            themeId === 'deep-navy' ? 'bg-blue-100' :
            themeId === 'muted-sage' ? 'bg-stone-200' :
            themeId === 'muted-lavender' ? 'bg-violet-100' :
            themeId === 'muted-seafoam' ? 'bg-teal-100' :
            themeId === 'muted-clay' ? 'bg-orange-100' :
            themeId === 'vibrant-coral' ? 'bg-rose-100' :
            themeId === 'vibrant-ocean' ? 'bg-sky-100' :
            themeId === 'vibrant-sunset' ? 'bg-orange-100' :
            themeId === 'vibrant-lime' ? 'bg-lime-100' :
            themeId === 'navy-gradient' ? 'bg-blue-100' :
            'bg-amber-100'
  };
};