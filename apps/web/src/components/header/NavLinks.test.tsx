import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NavLinks from './NavLinks';

describe('NavLinks', () => {
  it('renders all 5 navigation links', () => {
    render(<MemoryRouter><NavLinks /></MemoryRouter>);
    expect(screen.getByRole('link', { name: /home/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /legacies/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /stories/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /conversations/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /community/i })).toBeInTheDocument();
  });

  it('links point to correct routes', () => {
    render(<MemoryRouter><NavLinks /></MemoryRouter>);
    expect(screen.getByRole('link', { name: /home/i })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /legacies/i })).toHaveAttribute('href', '/legacies');
    expect(screen.getByRole('link', { name: /stories/i })).toHaveAttribute('href', '/stories');
    expect(screen.getByRole('link', { name: /conversations/i })).toHaveAttribute('href', '/conversations');
    expect(screen.getByRole('link', { name: /community/i })).toHaveAttribute('href', '/community');
  });

  it('marks the active route', () => {
    render(
      <MemoryRouter initialEntries={['/legacies']}>
        <NavLinks />
      </MemoryRouter>
    );
    const legaciesLink = screen.getByRole('link', { name: /legacies/i });
    expect(legaciesLink.className).toContain('text-theme-primary');
  });
});
