import { useEffect } from 'react';
import {
  Pin,
  PinOff,
  X,
  RefreshCw,
  User,
  MapPin,
  Calendar,
  Sparkles,
  Heart,
  Link2,
  Package,
  ChevronDown,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useStoryContext, useExtractContext, useUpdateFactStatus } from '../hooks/useStoryContext';
import { useEvolveWorkspaceStore } from '../store/useEvolveWorkspaceStore';
import type { ContextFact, FactCategory, FactStatus } from '../api/storyContext';

interface ContextToolProps {
  storyId: string;
}

const CATEGORY_CONFIG: Record<
  FactCategory,
  { label: string; icon: typeof User }
> = {
  person: { label: 'People', icon: User },
  place: { label: 'Places', icon: MapPin },
  date: { label: 'Dates & Periods', icon: Calendar },
  event: { label: 'Events', icon: Sparkles },
  emotion: { label: 'Emotions', icon: Heart },
  relationship: { label: 'Relationships', icon: Link2 },
  object: { label: 'Objects', icon: Package },
};

const CATEGORY_ORDER: FactCategory[] = [
  'person',
  'place',
  'date',
  'event',
  'emotion',
  'relationship',
  'object',
];

const FILTER_OPTIONS: Array<{ id: FactCategory | 'all'; label: string }> = [
  { id: 'all', label: 'All' },
  ...CATEGORY_ORDER.map((c) => ({ id: c, label: CATEGORY_CONFIG[c].label })),
];

export function ContextTool({ storyId }: ContextToolProps) {
  const { data: context, isLoading } = useStoryContext(storyId);
  const extractMutation = useExtractContext(storyId);
  const updateFact = useUpdateFactStatus(storyId);

  const contextFilter = useEvolveWorkspaceStore((s) => s.contextFilter);
  const setContextFilter = useEvolveWorkspaceStore((s) => s.setContextFilter);

  // Auto-trigger extraction on first visit if no context exists
  useEffect(() => {
    if (context === null && !extractMutation.isPending) {
      extractMutation.mutate(false);
    }
  }, [context]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTogglePin = (fact: ContextFact) => {
    const newStatus: FactStatus = fact.status === 'pinned' ? 'active' : 'pinned';
    updateFact.mutate({ factId: fact.id, status: newStatus });
  };

  const handleDismiss = (fact: ContextFact) => {
    updateFact.mutate({ factId: fact.id, status: 'dismissed' });
  };

  const handleRefresh = () => {
    extractMutation.mutate(true);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="p-4 flex items-center gap-2 text-sm text-neutral-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading context...
      </div>
    );
  }

  // No context yet, extracting
  if (context === null || (context?.extracting && !context.summary)) {
    return (
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm text-neutral-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Analyzing story...
        </div>
        <p className="text-xs text-neutral-400">
          Extracting key details from your story. This may take a moment.
        </p>
      </div>
    );
  }

  // Separate facts by source for "new from conversation" section
  const allFacts = context?.facts ?? [];
  const filteredFacts =
    contextFilter === 'all'
      ? allFacts
      : allFacts.filter((f) => f.category === contextFilter);

  const storyFacts = filteredFacts.filter((f) => f.source === 'story');
  const conversationFacts = filteredFacts.filter((f) => f.source === 'conversation');

  // Group facts by category
  const groupByCategory = (facts: ContextFact[]) => {
    const groups: Partial<Record<FactCategory, ContextFact[]>> = {};
    for (const fact of facts) {
      (groups[fact.category] ??= []).push(fact);
    }
    return groups;
  };

  const storyGroups = groupByCategory(storyFacts);
  const hasStoryFacts = storyFacts.length > 0;
  const hasConversationFacts = conversationFacts.length > 0;

  return (
    <div className="p-3 space-y-4">
      {/* Header with refresh */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
          Context
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRefresh}
          disabled={extractMutation.isPending}
          className="h-7 w-7 p-0"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${extractMutation.isPending ? 'animate-spin' : ''}`}
          />
        </Button>
      </div>

      {/* Summary */}
      {context?.summary && (
        <Collapsible defaultOpen>
          <CollapsibleTrigger className="flex items-center gap-1 text-xs font-medium text-neutral-500 uppercase tracking-wide w-full group">
            <ChevronDown className="h-3 w-3 group-data-[state=closed]:hidden" />
            <ChevronRight className="h-3 w-3 group-data-[state=open]:hidden" />
            Summary
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2 p-2.5 rounded-md border bg-neutral-50 text-sm text-neutral-700 leading-relaxed">
              {context.summary}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Category filter */}
      {allFacts.length > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
            Details
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                {FILTER_OPTIONS.find((o) => o.id === contextFilter)?.label ?? 'All'}
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {FILTER_OPTIONS.map((opt) => (
                <DropdownMenuItem
                  key={opt.id}
                  onClick={() => setContextFilter(opt.id)}
                  className={contextFilter === opt.id ? 'bg-neutral-100' : ''}
                >
                  {opt.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Story facts grouped by category */}
      {hasStoryFacts &&
        CATEGORY_ORDER.map((cat) => {
          const facts = storyGroups[cat];
          if (!facts || facts.length === 0) return null;
          const config = CATEGORY_CONFIG[cat];
          const Icon = config.icon;
          return (
            <div key={cat}>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Icon className="h-3.5 w-3.5 text-neutral-400" />
                <span className="text-xs text-neutral-500">{config.label}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {facts.map((fact) => (
                  <FactCard
                    key={fact.id}
                    fact={fact}
                    onTogglePin={handleTogglePin}
                    onDismiss={handleDismiss}
                  />
                ))}
              </div>
            </div>
          );
        })}

      {/* New from conversation separator */}
      {hasConversationFacts && (
        <>
          <div className="flex items-center gap-2 pt-1">
            <div className="flex-1 border-t border-dashed border-neutral-300" />
            <span className="text-[10px] font-medium text-theme-primary uppercase tracking-wider">
              New from conversation
            </span>
            <div className="flex-1 border-t border-dashed border-neutral-300" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {conversationFacts.map((fact) => (
              <FactCard
                key={fact.id}
                fact={fact}
                onTogglePin={handleTogglePin}
                onDismiss={handleDismiss}
                isNew
              />
            ))}
          </div>
        </>
      )}

      {/* Extracting indicator */}
      {context?.extracting && (
        <div className="flex items-center gap-2 text-xs text-neutral-400 pt-2">
          <Loader2 className="h-3 w-3 animate-spin" />
          Analyzing conversation...
        </div>
      )}

      {/* Empty state */}
      {!hasStoryFacts && !hasConversationFacts && !context?.summary && (
        <div className="text-sm text-neutral-400">
          No details found yet. Continue chatting to build context.
        </div>
      )}
    </div>
  );
}

// --- FactCard sub-component ---

function FactCard({
  fact,
  onTogglePin,
  onDismiss,
  isNew = false,
}: {
  fact: ContextFact;
  onTogglePin: (fact: ContextFact) => void;
  onDismiss: (fact: ContextFact) => void;
  isNew?: boolean;
}) {
  const isPinned = fact.status === 'pinned';
  const config = CATEGORY_CONFIG[fact.category];
  const Icon = config.icon;

  return (
    <div
      className={`group relative flex items-center gap-1.5 px-2 py-1 rounded-md border text-sm transition-colors ${
        isPinned
          ? 'border-theme-primary/30 bg-theme-primary/5'
          : isNew
            ? 'border-theme-primary/20 bg-theme-primary/[0.02]'
            : 'border-neutral-200 bg-neutral-50'
      }`}
    >
      <Icon className="h-3 w-3 text-neutral-400 shrink-0" />
      <span className="truncate max-w-[140px]" title={fact.detail ?? fact.content}>
        {fact.content}
      </span>

      {/* Pin toggle */}
      <button
        onClick={() => onTogglePin(fact)}
        className={`shrink-0 transition-opacity ${
          isPinned
            ? 'text-theme-primary opacity-100'
            : 'text-neutral-300 opacity-0 group-hover:opacity-100'
        }`}
        aria-label={isPinned ? 'Unpin from context' : 'Pin to context'}
      >
        {isPinned ? (
          <PinOff className="h-3 w-3" />
        ) : (
          <Pin className="h-3 w-3" />
        )}
      </button>

      {/* Dismiss button */}
      <button
        onClick={() => onDismiss(fact)}
        className="shrink-0 text-neutral-300 opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-400"
        aria-label="Dismiss fact"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
