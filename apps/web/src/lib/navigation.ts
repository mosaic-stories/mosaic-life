import {
  LayoutDashboard,
  BookOpen,
  FileText,
  Image,
  MessageCircle,
  User,
  Users,
  Sparkles,
  Compass,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
}

export interface Section {
  key: string;
  label: string;
  icon: LucideIcon;
  path: string;
  items?: NavItem[];
}

export const SECTIONS: Section[] = [
  {
    key: 'my',
    label: 'My Mosaic',
    icon: Sparkles,
    path: '/my',
    items: [
      { label: 'Overview', path: '/my/overview', icon: LayoutDashboard },
      { label: 'Legacies', path: '/my/legacies', icon: BookOpen },
      { label: 'Stories', path: '/my/stories', icon: FileText },
      { label: 'Media', path: '/my/media', icon: Image },
      { label: 'Conversations', path: '/my/conversations', icon: MessageCircle },
      { label: 'Personal', path: '/my/personal', icon: User },
    ],
  },
  {
    key: 'explore',
    label: 'Explore',
    icon: Compass,
    path: '/explore',
    items: [
      { label: 'Legacies', path: '/explore/legacies', icon: BookOpen },
      { label: 'Stories', path: '/explore/stories', icon: FileText },
      { label: 'Media', path: '/explore/media', icon: Image },
      { label: 'People', path: '/explore/people', icon: Users },
    ],
  },
  {
    key: 'community',
    label: 'Community',
    icon: Users,
    path: '/community',
  },
];

/** Helper: find which section the current path belongs to */
export function getActiveSection(pathname: string): Section | undefined {
  return SECTIONS.find(
    (s) => pathname === s.path || pathname.startsWith(s.path + '/'),
  );
}
