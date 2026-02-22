/**
 * Utility functions for AI chat components.
 */

export function getPersonaColor(personaId: string): string {
  switch (personaId) {
    case 'biographer':
      return 'bg-blue-100';
    case 'reporter':
      return 'bg-emerald-100';
    case 'friend':
      return 'bg-rose-100';
    case 'twin':
      return 'bg-purple-100';
    default:
      return 'bg-blue-100';
  }
}

export function formatTimestamp(isoString: string): string {
  return new Date(isoString).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export function formatRelativeTime(isoString: string | null): string {
  if (!isoString) return 'No messages';
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}
