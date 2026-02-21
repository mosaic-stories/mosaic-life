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
