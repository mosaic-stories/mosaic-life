import {
  Sparkles,
  Eye,
  Heart,
  MessageCircle,
  AlignLeft,
  FileText,
  Loader2,
  User,
  MapPin,
  Calendar,
  Link2,
  Package,
  GitBranch,
  MessageSquare,
} from 'lucide-react';
import { cn } from '@/components/ui/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useEvolveWorkspaceStore } from '../store/useEvolveWorkspaceStore';
import { useStoryContext } from '../hooks/useStoryContext';
import { usePersonas } from '@/features/ai-chat/hooks/useAIChat';
import { useAIChatStore } from '@/features/ai-chat/store/aiChatStore';
import type { WritingStyle, LengthPreference } from '@/lib/api/evolution';
import type { FactCategory } from '../api/storyContext';

const WRITING_STYLES: {
  id: WritingStyle;
  label: string;
  description: string;
  icon: typeof Eye;
}[] = [
  { id: 'vivid', label: 'Vivid', description: 'Sensory details, atmosphere', icon: Eye },
  { id: 'emotional', label: 'Emotional', description: 'Feelings, relationships', icon: Heart },
  { id: 'conversational', label: 'Conversational', description: 'Informal, personal', icon: MessageCircle },
  { id: 'concise', label: 'Concise', description: 'Tight, impactful', icon: AlignLeft },
  { id: 'documentary', label: 'Documentary', description: 'Factual, chronological', icon: FileText },
];

const LENGTH_OPTIONS: { id: LengthPreference; label: string }[] = [
  { id: 'similar', label: 'Similar' },
  { id: 'shorter', label: 'Shorter' },
  { id: 'longer', label: 'Longer' },
];

const CATEGORY_ICONS: Record<FactCategory, typeof User> = {
  person: User,
  place: MapPin,
  date: Calendar,
  event: Sparkles,
  emotion: Heart,
  relationship: Link2,
  object: Package,
};

interface RewriteToolProps {
  storyId: string;
  conversationId: string | null;
  onRewrite: () => void;
  onCancel?: () => void;
  hasContent: boolean;
}

export function RewriteTool({ storyId, conversationId, onRewrite, onCancel, hasContent }: RewriteToolProps) {
  const rewriteState = useEvolveWorkspaceStore((s) => s.rewriteState);
  const compareState = useEvolveWorkspaceStore((s) => s.compareState);
  const writingStyle = useEvolveWorkspaceStore((s) => s.writingStyle);
  const lengthPreference = useEvolveWorkspaceStore((s) => s.lengthPreference);
  const setWritingStyle = useEvolveWorkspaceStore((s) => s.setWritingStyle);
  const setLengthPreference = useEvolveWorkspaceStore((s) => s.setLengthPreference);
  const setActiveTool = useEvolveWorkspaceStore((s) => s.setActiveTool);
  const activePersonaId = useEvolveWorkspaceStore((s) => s.activePersonaId);

  const { data: context } = useStoryContext(storyId);
  const { data: personas } = usePersonas();

  // Get message count from AI chat store
  const messageCount = useAIChatStore((s) => {
    if (!conversationId) return 0;
    const conv = s.conversations.get(conversationId);
    return conv?.messages?.length ?? 0;
  });

  const pinnedFacts = context?.facts?.filter((f) => f.status === 'pinned') ?? [];
  const personaName = personas?.find((p) => p.id === activePersonaId)?.name ?? activePersonaId;
  const turnCount = Math.floor(messageCount / 2); // pairs of user+assistant

  const isStreaming = rewriteState === 'streaming';
  const isReviewing = rewriteState === 'reviewing';
  const isDisabled = isStreaming || compareState !== 'idle';
  const actionLabel = isReviewing ? 'Regenerate' : hasContent ? 'Rewrite Story' : 'Write Story';

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Style section */}
        <section>
          <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">
            Style
          </h3>
          <div className="flex flex-wrap gap-1">
            {WRITING_STYLES.map(({ id, label, description, icon: Icon }) => (
              <Tooltip key={id}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setWritingStyle(id)}
                    className={cn(
                      'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs font-medium transition-colors',
                      writingStyle === id
                        ? 'border-theme-primary bg-theme-primary/5 text-theme-primary'
                        : 'border-neutral-200 text-neutral-600 hover:border-neutral-300',
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{description}</TooltipContent>
              </Tooltip>
            ))}
          </div>
        </section>

        {/* Length section */}
        <section>
          <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">
            Length
          </h3>
          <div className="flex gap-1">
            {LENGTH_OPTIONS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setLengthPreference(id)}
                className={cn(
                  'flex-1 px-2.5 py-1.5 rounded-md border text-xs font-medium transition-colors text-center',
                  lengthPreference === id
                    ? 'border-theme-primary bg-theme-primary/5 text-theme-primary'
                    : 'border-neutral-200 text-neutral-600 hover:border-neutral-300',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        {/* Divider */}
        <hr className="border-neutral-100" />

        {/* Briefing section */}
        <section className="space-y-3">
          <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
            {hasContent ? 'Rewrite will use' : 'Write will use'}
          </h3>

          {/* Context briefing */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-medium text-neutral-600">
              <GitBranch className="h-3.5 w-3.5" />
              Context
            </div>
            {context?.summary ? (
              <p className="text-xs text-neutral-500 line-clamp-2 pl-5">
                {context.summary}
              </p>
            ) : (
              <p className="text-xs text-neutral-400 pl-5">
                No summary yet —{' '}
                <button
                  onClick={() => setActiveTool('context')}
                  className="text-theme-primary hover:underline"
                >
                  extract context
                </button>
              </p>
            )}

            {pinnedFacts.length > 0 ? (
              <div className="pl-5 space-y-0.5">
                <p className="text-xs text-neutral-500">
                  {pinnedFacts.length} pinned fact{pinnedFacts.length !== 1 ? 's' : ''}
                </p>
                {pinnedFacts.map((fact) => {
                  const Icon = CATEGORY_ICONS[fact.category];
                  return (
                    <div key={fact.id} className="flex items-center gap-1.5 text-xs text-neutral-500">
                      <Icon className="h-3 w-3 shrink-0 text-neutral-400" />
                      <span>{fact.content}</span>
                      {fact.detail && (
                        <span className="text-neutral-400">— {fact.detail}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-neutral-400 pl-5">
                No facts pinned —{' '}
                <button
                  onClick={() => setActiveTool('context')}
                  className="text-theme-primary hover:underline"
                >
                  pin facts in Context
                </button>
              </p>
            )}
          </div>

          {/* Conversation briefing */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-medium text-neutral-600">
              <MessageSquare className="h-3.5 w-3.5" />
              Conversation
            </div>
            {turnCount > 0 ? (
              <p className="text-xs text-neutral-500 pl-5">
                {turnCount} turn{turnCount !== 1 ? 's' : ''} with {personaName}
              </p>
            ) : (
              <p className="text-xs text-neutral-400 pl-5">
                No conversation yet —{' '}
                <button
                  onClick={() => setActiveTool('ai-chat')}
                  className="text-theme-primary hover:underline"
                >
                  chat with a persona
                </button>
              </p>
            )}
          </div>
        </section>
      </div>

      {/* Sticky action footer */}
      <div className="shrink-0 p-3 border-t bg-white">
        {isReviewing && (
          <p className="text-xs text-neutral-400 mb-2 text-center">
            Accept or discard the rewrite in the editor
          </p>
        )}
        <Button
          className="w-full"
          onClick={onRewrite}
          disabled={isDisabled}
          aria-label={actionLabel}
        >
          {isStreaming ? (
            <>
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              {hasContent ? 'Rewriting…' : 'Writing…'}
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-1.5" />
              {actionLabel}
            </>
          )}
        </Button>
        {isStreaming && onCancel && (
          <button
            onClick={onCancel}
            className="w-full mt-1.5 text-xs text-neutral-500 hover:text-neutral-700 text-center"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
