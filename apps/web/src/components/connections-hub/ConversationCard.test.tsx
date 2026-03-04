import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ConversationCard from './ConversationCard';
import type { ConversationSummary } from '@/features/ai-chat/api/ai';

vi.mock('@/features/ai-chat/hooks/useAIChat', () => ({
  usePersonas: () => ({
    data: [
      { id: 'biographer', name: 'The Biographer', icon: 'BookOpen', description: '' },
    ],
    isLoading: false,
  }),
}));

const mockConversation: ConversationSummary = {
  id: '1',
  persona_id: 'biographer',
  title: 'Discussing childhood memories',
  legacies: [
    { legacy_id: 'leg1', legacy_name: 'Margaret Chen', role: 'primary', position: 0 },
  ],
  message_count: 12,
  last_message_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
};

describe('ConversationCard', () => {
  it('renders persona name', () => {
    render(<ConversationCard conversation={mockConversation} />);
    expect(screen.getByText('The Biographer')).toBeInTheDocument();
  });

  it('renders legacy name', () => {
    render(<ConversationCard conversation={mockConversation} />);
    expect(screen.getByText('Margaret Chen')).toBeInTheDocument();
  });

  it('renders message count', () => {
    render(<ConversationCard conversation={mockConversation} />);
    expect(screen.getByText('12 messages')).toBeInTheDocument();
  });

  it('renders conversation title', () => {
    render(<ConversationCard conversation={mockConversation} />);
    expect(screen.getByText('Discussing childhood memories')).toBeInTheDocument();
  });
});
