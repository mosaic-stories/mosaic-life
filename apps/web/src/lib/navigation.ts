import { Home, Landmark, BookOpen, Link2, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Home', path: '/', icon: Home },
  { label: 'Legacies', path: '/legacies', icon: Landmark },
  { label: 'Stories', path: '/stories', icon: BookOpen },
  { label: 'Connections', path: '/connections', icon: Link2 },
  { label: 'Community', path: '/community', icon: Users },
];
