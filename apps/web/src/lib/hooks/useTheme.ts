import { create } from 'zustand';
import { applyTheme } from '@/lib/themeUtils';

interface ThemeState {
  currentTheme: string;
  setTheme: (themeId: string) => void;
}

export const useTheme = create<ThemeState>((set) => ({
  currentTheme: localStorage.getItem('mosaic-theme') || 'warm-amber',
  setTheme: (themeId: string) => {
    set({ currentTheme: themeId });
    localStorage.setItem('mosaic-theme', themeId);
    applyTheme(themeId);
  },
}));
