import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import SectionNav from './SectionNav';

describe('SectionNav', () => {
  it('links the creator name to the public profile when a username is available', () => {
    render(
      <MemoryRouter>
        <SectionNav
          activeSection="stories"
          onSectionChange={vi.fn()}
          creatorName="Jordan Doe"
          creatorUsername="jordan-doe"
        />
      </MemoryRouter>
    );

    const creatorLink = screen.getByRole('link', { name: 'Jordan Doe' });
    expect(creatorLink).toHaveAttribute('href', '/u/jordan-doe');
  });

  it('renders plain text when the creator username is unavailable', () => {
    render(
      <MemoryRouter>
        <SectionNav
          activeSection="stories"
          onSectionChange={vi.fn()}
          creatorName="Jordan Doe"
        />
      </MemoryRouter>
    );

    expect(screen.getByText('Jordan Doe')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Jordan Doe' })).not.toBeInTheDocument();
  });

  it('keeps the members control clickable', async () => {
    const user = userEvent.setup();
    const onMembersClick = vi.fn();

    render(
      <MemoryRouter>
        <SectionNav
          activeSection="stories"
          onSectionChange={vi.fn()}
          memberCount={2}
          onMembersClick={onMembersClick}
        />
      </MemoryRouter>
    );

    await user.click(screen.getByRole('button', { name: /2 members/i }));

    expect(onMembersClick).toHaveBeenCalledTimes(1);
  });
});
