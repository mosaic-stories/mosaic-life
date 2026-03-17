import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Loader2, Users } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { useUserSearch } from '../hooks/useUserSearch';
import type { UserSearchResult } from '../api/userSearch';

interface PeopleSearchProps {
  variant: 'full' | 'compact';
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function ResultItem({
  user,
  onClick,
}: {
  user: UserSearchResult;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 w-full px-3 py-2.5 text-left rounded-lg hover:bg-neutral-50 transition-colors"
    >
      <Avatar className="size-9 shrink-0">
        <AvatarImage src={user.avatar_url || undefined} />
        <AvatarFallback className="text-xs">
          {getInitials(user.name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="text-sm font-medium text-neutral-900 truncate">
          {user.name}
        </p>
        {user.username && (
          <p className="text-xs text-neutral-500 truncate">@{user.username}</p>
        )}
      </div>
    </button>
  );
}

export default function PeopleSearch({ variant }: PeopleSearchProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Strip @ for the API call but keep it in the input
  const cleanQuery = query.replace(/^@/, '');
  const debouncedQuery = useDebounce(cleanQuery, 300);
  const { data: results, isLoading } = useUserSearch(debouncedQuery);

  const hasResults = results && results.length > 0;
  const showNoResults =
    debouncedQuery.length >= 3 && !isLoading && !hasResults;

  // Close compact dropdown on outside click
  useEffect(() => {
    if (variant !== 'compact') return;
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [variant]);

  // Open dropdown when results arrive (compact only)
  useEffect(() => {
    if (variant === 'compact' && (hasResults || showNoResults)) {
      setDropdownOpen(true);
    }
  }, [variant, hasResults, showNoResults]);

  const handleSelect = (user: UserSearchResult) => {
    if (user.username) {
      navigate(`/u/${user.username}`);
    }
    setQuery('');
    setDropdownOpen(false);
  };

  const resultsList = (
    <>
      {isLoading && debouncedQuery.length >= 3 && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="size-4 animate-spin text-theme-primary" />
        </div>
      )}
      {hasResults &&
        results.map((user) => (
          <ResultItem
            key={user.id}
            user={user}
            onClick={() => handleSelect(user)}
          />
        ))}
      {showNoResults && (
        <div className="py-4 text-center">
          <Users className="size-5 text-neutral-300 mx-auto mb-1" />
          <p className="text-xs text-neutral-500">No users found</p>
        </div>
      )}
    </>
  );

  // --- Full variant: results always visible below input ---
  if (variant === 'full') {
    return (
      <div className="space-y-2">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or @username..."
            className="pl-9"
          />
        </div>
        {(hasResults || showNoResults || (isLoading && debouncedQuery.length >= 3)) && (
          <div className="rounded-lg border bg-white divide-y divide-neutral-100">
            {resultsList}
          </div>
        )}
      </div>
    );
  }

  // --- Compact variant: dropdown overlay ---
  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-400" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (hasResults || showNoResults) setDropdownOpen(true);
          }}
          placeholder="Search by name or @username..."
          className="pl-9 h-9 text-sm"
        />
      </div>
      {dropdownOpen &&
        (hasResults || showNoResults || (isLoading && debouncedQuery.length >= 3)) && (
          <div className="absolute z-10 top-full mt-1 w-full rounded-lg border bg-white shadow-lg max-h-64 overflow-y-auto divide-y divide-neutral-100">
            {resultsList}
          </div>
        )}
    </div>
  );
}
