import { Pin, PinOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useGraphContext } from '../hooks/useGraphContext';
import { useEvolveWorkspaceStore } from '../store/useEvolveWorkspaceStore';

interface ContextToolProps {
  storyId: string;
}

export function ContextTool({ storyId }: ContextToolProps) {
  const { data, isLoading } = useGraphContext(storyId);
  const pinnedContextIds = useEvolveWorkspaceStore((s) => s.pinnedContextIds);
  const togglePinnedContext = useEvolveWorkspaceStore((s) => s.togglePinnedContext);

  if (isLoading) {
    return <div className="p-4 text-sm text-neutral-400">Loading context...</div>;
  }

  if (!data) {
    return (
      <div className="p-4 text-sm text-neutral-400">
        No graph context available. Context will appear as more stories are added.
      </div>
    );
  }

  const { related_stories, entities } = data;
  const hasEntities =
    entities.people.length > 0 ||
    entities.places.length > 0 ||
    entities.events.length > 0 ||
    entities.objects.length > 0;

  return (
    <div className="p-3 space-y-4">
      {/* Related Stories */}
      {related_stories.length > 0 && (
        <section>
          <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">
            Related Stories
          </h3>
          <div className="space-y-2">
            {related_stories.map((story) => {
              const isPinned = pinnedContextIds.includes(story.id);
              return (
                <div
                  key={story.id}
                  className="flex items-start justify-between p-2 rounded-md border bg-neutral-50 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">{story.title}</p>
                    {story.snippet && (
                      <p className="text-xs text-neutral-500 line-clamp-2 mt-0.5">
                        {story.snippet}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => togglePinnedContext(story.id)}
                    className="ml-2 text-neutral-400 hover:text-theme-primary shrink-0"
                    aria-label={isPinned ? 'Unpin from context' : 'Pin to context'}
                  >
                    {isPinned ? (
                      <PinOff className="h-4 w-4" />
                    ) : (
                      <Pin className="h-4 w-4" />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Entities */}
      {hasEntities && (
        <section>
          <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">
            Entities
          </h3>
          <div className="space-y-2">
            {entities.people.length > 0 && (
              <EntityChips label="People" items={entities.people} />
            )}
            {entities.places.length > 0 && (
              <EntityChips label="Places" items={entities.places} />
            )}
            {entities.events.length > 0 && (
              <EntityChips label="Events" items={entities.events} />
            )}
            {entities.objects.length > 0 && (
              <EntityChips label="Objects" items={entities.objects} />
            )}
          </div>
        </section>
      )}

      {related_stories.length === 0 && !hasEntities && (
        <div className="text-sm text-neutral-400">
          No connections found yet. Add more stories to build the knowledge graph.
        </div>
      )}
    </div>
  );
}

function EntityChips({
  label,
  items,
}: {
  label: string;
  items: Array<Record<string, string>>;
}) {
  return (
    <div>
      <span className="text-xs text-neutral-500">{label}</span>
      <div className="flex flex-wrap gap-1 mt-1">
        {items.map((item, i) => (
          <Badge key={i} variant="secondary" className="text-xs">
            {item.name || item.period || Object.values(item)[0]}
          </Badge>
        ))}
      </div>
    </div>
  );
}
