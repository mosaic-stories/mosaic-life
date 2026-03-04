import { formatDistanceToNow } from 'date-fns';
import type { ConversationSummary } from '@/features/ai-chat/api/ai';
import { usePersonas } from '@/features/ai-chat/hooks/useAIChat';
import { getPersonaIconComponent } from '@/features/ai-chat/utils/personaIcons';

const FALLBACK_PERSONA_NAME = 'AI Persona';

interface ConversationCardProps {
  conversation: ConversationSummary;
}

export default function ConversationCard({ conversation }: ConversationCardProps) {
  const { data: personas } = usePersonas();
  const persona = personas?.find((p) => p.id === conversation.persona_id);
  const Icon = getPersonaIconComponent(persona?.icon ?? '');
  const personaName = persona?.name ?? FALLBACK_PERSONA_NAME;
  const legacyName = conversation.legacies[0]?.legacy_name ?? 'Unknown Legacy';
  const timeAgo = conversation.last_message_at
    ? formatDistanceToNow(new Date(conversation.last_message_at), { addSuffix: true })
    : formatDistanceToNow(new Date(conversation.created_at), { addSuffix: true });

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 space-y-3 hover:shadow-sm transition-shadow">
      <div className="flex items-center gap-3">
        <div className="size-10 rounded-full bg-neutral-100 flex items-center justify-center flex-shrink-0">
          <Icon className="size-5 text-neutral-500" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-neutral-900">{personaName}</p>
          <p className="text-xs text-neutral-500 truncate">{legacyName}</p>
        </div>
        <span className="text-xs text-neutral-400 flex-shrink-0">{timeAgo}</span>
      </div>

      {conversation.title && (
        <p className="text-sm text-neutral-700 line-clamp-2">{conversation.title}</p>
      )}

      <div className="flex items-center gap-2 text-xs text-neutral-400">
        <span>{conversation.message_count} messages</span>
      </div>
    </div>
  );
}
