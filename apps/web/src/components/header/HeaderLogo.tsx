import { BookHeart } from 'lucide-react';

interface HeaderLogoProps {
  onNavigateHome: () => void;
}

export default function HeaderLogo({ onNavigateHome }: HeaderLogoProps) {
  return (
    <button
      onClick={onNavigateHome}
      className="flex items-center gap-2 hover:opacity-80 transition-opacity flex-shrink-0"
      aria-label="Mosaic Life - Go to homepage"
    >
      <BookHeart className="size-6 text-[rgb(var(--theme-primary))]" />
      <span className="tracking-tight hidden sm:inline">Mosaic Life</span>
    </button>
  );
}
