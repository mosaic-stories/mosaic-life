import { Home, Landmark, BookOpen, MessageCircle, Users } from 'lucide-react';
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
  { label: 'Conversations', path: '/conversations', icon: MessageCircle },
  { label: 'Community', path: '/community', icon: Users },
];
