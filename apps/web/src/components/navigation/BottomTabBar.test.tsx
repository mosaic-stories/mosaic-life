import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import BottomTabBar from './BottomTabBar';

describe('BottomTabBar', () => {
  it('renders all 5 tab links', () => {
    render(<MemoryRouter><BottomTabBar /></MemoryRouter>);
    expect(screen.getByRole('link', { name: /home/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /legacies/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /stories/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /connections/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /community/i })).toBeInTheDocument();
  });

  it('links point to correct routes', () => {
    render(<MemoryRouter><BottomTabBar /></MemoryRouter>);
    expect(screen.getByRole('link', { name: /legacies/i })).toHaveAttribute('href', '/legacies');
  });

  it('marks the active tab', () => {
    render(
      <MemoryRouter initialEntries={['/stories']}>
        <BottomTabBar />
      </MemoryRouter>
    );
    const storiesLink = screen.getByRole('link', { name: /stories/i });
    expect(storiesLink.className).toContain('text-theme-primary');
  });
});
