import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PageActionBar from './PageActionBar';

describe('PageActionBar', () => {
  it('renders a back link with the given label', () => {
    render(
      <MemoryRouter>
        <PageActionBar backLabel="Legacies" backTo="/legacies">
          <button>Action</button>
        </PageActionBar>
      </MemoryRouter>
    );
    const link = screen.getByRole('link', { name: /legacies/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/legacies');
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
        <PageActionBar backLabel="Stories" backTo="/stories">
          <button>Action</button>
        </PageActionBar>
      </MemoryRouter>
    );
    // The link should contain the ArrowLeft icon (rendered as svg)
    const link = screen.getByRole('link', { name: /stories/i });
    expect(link.querySelector('svg')).toBeInTheDocument();
  });
});
