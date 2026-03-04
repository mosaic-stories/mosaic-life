/**
 * Shared utility for mapping backend persona icon names to Lucide React
 * components. This prevents individual components from maintaining their
 * own duplicate mappings that silently break when new personas are added.
 */
import {
  BookOpen,
  Heart,
  Briefcase,
  Users,
  MessageCircle,
  type LucideIcon,
} from 'lucide-react';

/** Maps the `persona.icon` string (from /api/ai/personas) to a Lucide component. */
export const PERSONA_ICON_MAP: Record<string, LucideIcon> = {
  BookOpen,
  Heart,
  Briefcase,
  Users,
  MessageCircle,
};

/**
 * Returns the Lucide icon component for the given icon name string.
 * Falls back to `BookOpen` for unknown icon names.
 */
export function getPersonaIconComponent(iconName: string): LucideIcon {
  return PERSONA_ICON_MAP[iconName] ?? BookOpen;
}
