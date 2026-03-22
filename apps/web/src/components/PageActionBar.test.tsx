import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import PageActionBar from './PageActionBar';

describe('PageActionBar', () => {
  it('renders a back link with the given label', () => {
    render(
      <MemoryRouter>
        <PageActionBar backLabel="Legacies" backTo="/my/legacies">
          <button>Action</button>
        </PageActionBar>
      </MemoryRouter>
    );
    const link = screen.getByRole('link', { name: /legacies/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/my/legacies');
  });

  it('renders children as actions on the right', () => {
    render(
      <MemoryRouter>
        <PageActionBar backLabel="Home" backTo="/">
          <button>Share</button>
          <button>Delete</button>
        </PageActionBar>
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: /share/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
  });

  it('renders the back arrow icon', () => {
    render(
      <MemoryRouter>
        <PageActionBar backLabel="Stories" backTo="/my/stories">
          <button>Action</button>
        </PageActionBar>
      </MemoryRouter>
    );
    // The link should contain the ArrowLeft icon (rendered as svg)
    const link = screen.getByRole('link', { name: /stories/i });
    expect(link.querySelector('svg')).toBeInTheDocument();
  });

  it('renders a button when onBack is provided instead of backTo', () => {
    const handleBack = vi.fn();
    render(
      <MemoryRouter>
        <PageActionBar backLabel="Back" onBack={handleBack}>
          <button>Action</button>
        </PageActionBar>
      </MemoryRouter>
    );
    // Should be a button, not a link
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    const btn = screen.getByRole('button', { name: /back/i });
    expect(btn).toBeInTheDocument();
  });

  it('calls onBack when the back button is clicked', async () => {
    const handleBack = vi.fn();
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <PageActionBar backLabel="Back" onBack={handleBack} />
      </MemoryRouter>
    );
    await user.click(screen.getByRole('button', { name: /back/i }));
    expect(handleBack).toHaveBeenCalledOnce();
  });

  it('renders without children (no right-side container)', () => {
    render(
      <MemoryRouter>
        <PageActionBar backLabel="Home" backTo="/" />
      </MemoryRouter>
    );
    // Only the back link, no extra wrapper div
    expect(screen.getByRole('link', { name: /home/i })).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
