import { Loader2, MessageCircle } from 'lucide-react';
import { useConversationList } from '@/features/ai-chat/hooks/useAIChat';
import ConversationCard from './ConversationCard';
import QuickFilters from '@/components/legacies-hub/QuickFilters';
import type { FilterOption } from '@/components/legacies-hub/QuickFilters';

interface PersonasTabContentProps {
  activeFilter: string;
  onFilterChange: (key: string) => void;
}

export default function PersonasTabContent({ activeFilter, onFilterChange }: PersonasTabContentProps) {
  const personaId = activeFilter === 'all' ? '' : activeFilter;
  const { data: conversations, isLoading } = useConversationList('', personaId);

  // Count conversations per persona for filter badges
  const { data: allConversations } = useConversationList('', '');
  const biographerCount = allConversations?.filter((c) => c.persona_id === 'biographer').length ?? 0;
  const friendCount = allConversations?.filter((c) => c.persona_id === 'friend').length ?? 0;

  const filterOptions: FilterOption[] = [
    { key: 'all', label: 'All', count: allConversations?.length },
    { key: 'biographer', label: 'Biographer', count: biographerCount || undefined },
    { key: 'friend', label: 'Friend', count: friendCount || undefined },
  ];

  return (
    <div className="space-y-6">
      <QuickFilters options={filterOptions} activeKey={activeFilter} onChange={onFilterChange} />

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-theme-primary" />
        </div>
      )}

      {!isLoading && conversations && conversations.length > 0 && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {conversations.map((conv) => (
            <ConversationCard key={conv.id} conversation={conv} />
          ))}
        </div>
      )}

      {!isLoading && (!conversations || conversations.length === 0) && (
        <div className="text-center py-12">
          <MessageCircle className="size-12 mx-auto text-neutral-300 mb-4" />
          <p className="text-neutral-600">
            {activeFilter !== 'all'
              ? `No conversations with this persona yet.`
              : 'Start a conversation with one of your AI personas to see them here.'}
          </p>
        </div>
      )}
    </div>
  );
}
