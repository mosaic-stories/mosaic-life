import { useState, useEffect, useRef } from 'react';
import { Search, X, Users, BookHeart, FileText, User } from 'lucide-react';
import { Card } from './ui/card';
import { Badge } from './ui/badge';

interface SearchResult {
  id: string;
  type: 'legacy' | 'community' | 'story' | 'person';
  title: string;
  subtitle?: string;
  badge?: string;
  badgeColor?: string;
  image?: string;
}

interface SearchBarProps {
  onSelectResult: (type: string, id: string) => void;
  compact?: boolean;
}

export default function SearchBar({ onSelectResult, compact }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const searchRef = useRef<HTMLDivElement>(null);

  // Mock search data
  const allSearchData: SearchResult[] = [
    {
      id: '1',
      type: 'legacy',
      title: 'Sarah Chen',
      subtitle: 'Teacher, mentor, and friend',
      badge: 'In Memoriam',
      badgeColor: 'bg-amber-100 text-amber-800 border-amber-200',
      image: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&h=200&fit=crop'
    },
    {
      id: '2',
      type: 'legacy',
      title: 'Robert "Bob" Anderson',
      subtitle: '35 years of service',
      badge: 'Retirement',
      badgeColor: 'bg-blue-100 text-blue-800 border-blue-200',
      image: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&h=200&fit=crop'
    },
    {
      id: '3',
      type: 'legacy',
      title: 'James Martinez',
      subtitle: 'Computer Science graduate',
      badge: 'Graduation',
      badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop'
    },
    {
      id: '4',
      type: 'legacy',
      title: 'Margaret "Maggie" Thompson',
      subtitle: 'Community leader and advocate',
      badge: 'Living Tribute',
      badgeColor: 'bg-purple-100 text-purple-800 border-purple-200',
      image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop'
    },
    {
      id: 'veterans',
      type: 'community',
      title: 'Remembering Our Veterans',
      subtitle: '342 members • Public',
      badge: 'Community'
    },
    {
      id: 'grief',
      type: 'community',
      title: 'Grief Support Circle',
      subtitle: '127 members • Private',
      badge: 'Community'
    },
    {
      id: 'family',
      type: 'community',
      title: 'Preserving Family History',
      subtitle: '423 members • Public',
      badge: 'Community'
    }
  ];

  // Handle search
  useEffect(() => {
    if (query.trim().length > 0) {
      const searchTerm = query.toLowerCase();
      const filtered = allSearchData.filter(item => 
        item.title.toLowerCase().includes(searchTerm) ||
        item.subtitle?.toLowerCase().includes(searchTerm) ||
        item.badge?.toLowerCase().includes(searchTerm)
      );
      setResults(filtered);
      setIsOpen(true);
    } else {
      setResults([]);
      setIsOpen(false);
    }
  }, [query]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectResult = (result: SearchResult) => {
    onSelectResult(result.type, result.id);
    setQuery('');
    setIsOpen(false);
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'legacy':
        return <BookHeart className="size-4 text-neutral-500" />;
      case 'community':
        return <Users className="size-4 text-neutral-500" />;
      case 'story':
        return <FileText className="size-4 text-neutral-500" />;
      case 'person':
        return <User className="size-4 text-neutral-500" />;
      default:
        return <Search className="size-4 text-neutral-500" />;
    }
  };

  const groupedResults = results.reduce((acc, result) => {
    if (!acc[result.type]) {
      acc[result.type] = [];
    }
    acc[result.type].push(result);
    return acc;
  }, {} as Record<string, SearchResult[]>);

  const typeLabels = {
    legacy: 'Legacies',
    community: 'Communities',
    story: 'Stories',
    person: 'People'
  };

  return (
    <div ref={searchRef} className={`relative ${compact ? 'w-full max-w-md' : 'w-full max-w-xl'}`}>
      {/* Search Input */}
      <div className="relative">
        <Search className={`absolute left-3 top-1/2 -translate-y-1/2 ${compact ? 'size-4' : 'size-5'} text-neutral-400`} />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={compact ? "Search..." : "Search legacies, communities, stories..."}
          className={`w-full ${compact ? 'h-10 pl-10 pr-10 text-sm' : 'h-12 pl-12 pr-12'} bg-neutral-50 border border-neutral-200 rounded-full focus:outline-none focus:ring-2 focus:ring-[rgb(var(--theme-primary))] focus:bg-white transition-all`}
        />
        {query && (
          <button
            onClick={() => {
              setQuery('');
              setIsOpen(false);
            }}
            className={`absolute ${compact ? 'right-3' : 'right-4'} top-1/2 -translate-y-1/2 p-1 hover:bg-neutral-100 rounded-full transition-colors`}
          >
            <X className={`${compact ? 'size-3' : 'size-4'} text-neutral-500`} />
          </button>
        )}
      </div>

      {/* Search Results Dropdown */}
      {isOpen && results.length > 0 && (
        <Card className="absolute top-full mt-2 w-full max-h-[500px] overflow-y-auto shadow-xl border border-neutral-200 z-50">
          <div className="p-2">
            {Object.entries(groupedResults).map(([type, items]) => (
              <div key={type} className="mb-4 last:mb-0">
                <div className="px-3 py-2 text-xs text-neutral-500 uppercase tracking-wide">
                  {typeLabels[type as keyof typeof typeLabels]}
                </div>
                <div className="space-y-1">
                  {items.map((result) => (
                    <button
                      key={result.id}
                      onClick={() => handleSelectResult(result)}
                      className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-neutral-50 transition-colors text-left"
                    >
                      {result.image ? (
                        <img
                          src={result.image}
                          alt={result.title}
                          className="size-10 rounded-full object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="size-10 rounded-full bg-neutral-100 flex items-center justify-center flex-shrink-0">
                          {getIcon(result.type)}
                        </div>
                      )}
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm text-neutral-900 truncate">
                            {result.title}
                          </p>
                          {result.badge && (
                            <Badge variant="outline" className={`text-xs ${result.badgeColor || 'bg-neutral-100'} flex-shrink-0`}>
                              {result.badge}
                            </Badge>
                          )}
                        </div>
                        {result.subtitle && (
                          <p className="text-xs text-neutral-500 truncate">
                            {result.subtitle}
                          </p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* No Results */}
      {isOpen && query.trim().length > 0 && results.length === 0 && (
        <Card className="absolute top-full mt-2 w-full shadow-xl border border-neutral-200 z-50">
          <div className="p-6 text-center space-y-2">
            <Search className="size-8 text-neutral-300 mx-auto" />
            <p className="text-sm text-neutral-600">No results found for "{query}"</p>
            <p className="text-xs text-neutral-500">Try searching for a different term</p>
          </div>
        </Card>
      )}
    </div>
  );
}