/**
 * Renders the appropriate icon for a persona based on icon name.
 */

import { BookOpen, Search, Heart, Users } from 'lucide-react';

interface PersonaIconProps {
  iconName: string;
}

export function PersonaIcon({ iconName }: PersonaIconProps) {
  switch (iconName) {
    case 'BookOpen':
      return <BookOpen className="size-5 text-blue-600" />;
    case 'Search':
      return <Search className="size-5 text-emerald-600" />;
    case 'Heart':
      return <Heart className="size-5 text-rose-600" />;
    case 'Users':
      return <Users className="size-5 text-purple-600" />;
    default:
      return <BookOpen className="size-5 text-blue-600" />;
  }
}
