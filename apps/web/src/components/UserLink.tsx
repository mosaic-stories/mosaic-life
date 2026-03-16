import { Link } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

export interface UserLinkProps {
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  showAvatar?: boolean;
  className?: string;
  avatarClassName?: string;
  nameClassName?: string;
  ariaLabel?: string;
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?';
}

export default function UserLink({
  username,
  displayName,
  avatarUrl,
  showAvatar = false,
  className = '',
  avatarClassName = 'size-6',
  nameClassName = '',
  ariaLabel,
}: UserLinkProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLAnchorElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.stopPropagation();
    }
  };

  return (
    <Link
      to={`/u/${username}`}
      className={`inline-flex items-center gap-1.5 hover:underline ${className}`}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={handleKeyDown}
      aria-label={ariaLabel}
    >
      {showAvatar && (
        <Avatar className={avatarClassName}>
          <AvatarImage src={avatarUrl || undefined} alt={displayName} />
          <AvatarFallback className="bg-theme-primary text-white text-[9px] font-semibold">
            {getInitials(displayName)}
          </AvatarFallback>
        </Avatar>
      )}
      <span className={nameClassName}>{displayName}</span>
    </Link>
  );
}
