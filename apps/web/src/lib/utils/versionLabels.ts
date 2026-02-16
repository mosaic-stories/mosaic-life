export function getSourceLabel(source: string): string {
  switch (source) {
    case 'edit':
      return 'Manual edit';
    case 'ai_generate':
      return 'AI enhancement';
    case 'restoration':
      return 'Restoration';
    case 'creation':
      return 'Original';
    default:
      return source;
  }
}
