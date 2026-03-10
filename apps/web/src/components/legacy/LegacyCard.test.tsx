import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import LegacyCard from './LegacyCard';
import type { Legacy } from '@/features/legacy/api/legacies';

const baseLegacy: Legacy = {
  id: 'leg-1',
  name: 'Test Legacy',
  birth_date: '1950-01-01',
  death_date: '2020-12-31',
  biography: 'A wonderful person who lived a full life.',
  visibility: 'public',
  created_by: 'user-1',
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
  members: [
    { user_id: 'u1', email: 'a@b.com', name: 'A', role: 'creator', joined_at: '2025-01-01' },
    { user_id: 'u2', email: 'b@b.com', name: 'B', role: 'admirer', joined_at: '2025-01-01' },
  ],
  profile_image_url: null,
  story_count: 0,
};

function renderCard(props: Partial<React.ComponentProps<typeof LegacyCard>> = {}) {
  return render(
    <MemoryRouter>
      <LegacyCard legacy={baseLegacy} {...props} />
    </MemoryRouter>
  );
}

describe('LegacyCard', () => {
  it('renders legacy name and biography', () => {
    renderCard();
    expect(screen.getByText('Test Legacy')).toBeInTheDocument();
    expect(screen.getByText(/a wonderful person/i)).toBeInTheDocument();
  });

  it('uses truncation-safe layout classes for long content', () => {
    renderCard({
      legacy: {
        ...baseLegacy,
        name: 'An exceptionally long legacy name that should not force the dashboard card wider than its grid track when production data is present',
        biography: 'A very long biography intended to mimic production content and ensure the card keeps its content inside the available viewport width without growing its parent layout unexpectedly.',
      },
      trailingAction: <span data-testid="fav-btn">Fav</span>,
    });

    const title = screen.getByRole('heading', {
      level: 3,
      name: /an exceptionally long legacy name/i,
    });
    expect(title.className).toContain('truncate');

    const textColumn = title.parentElement;
    expect(textColumn?.className).toContain('min-w-0');

    const trailingAction = screen.getByTestId('fav-btn').parentElement;
    expect(trailingAction?.className).toContain('shrink-0');
  });

  it('renders member count', () => {
    renderCard();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('shows visibility indicator when showVisibility is true', () => {
    renderCard({ showVisibility: true });
    expect(screen.getByText('Public')).toBeInTheDocument();
  });

  it('hides visibility indicator by default', () => {
    renderCard();
    expect(screen.queryByText('Public')).not.toBeInTheDocument();
  });

  it('renders trailing action when provided', () => {
    renderCard({ trailingAction: <span data-testid="fav-btn">Fav</span> });
    expect(screen.getByTestId('fav-btn')).toBeInTheDocument();
  });

  it('suppresses the context badge when requested', () => {
    renderCard({ hideContextBadge: true });
    expect(screen.queryByText(/living tribute/i)).not.toBeInTheDocument();
  });

  it('supports keyboard activation on the card container', async () => {
    renderCard();
    const card = screen.getByRole('button', { name: /test legacy/i });
    card.focus();
    await userEvent.keyboard('{Enter}');
    expect(card).toHaveFocus();
  });
});
