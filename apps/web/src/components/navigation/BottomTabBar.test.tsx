import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import BottomTabBar from './BottomTabBar';

describe('BottomTabBar', () => {
  it('renders all 3 section tabs', () => {
    render(<MemoryRouter><BottomTabBar /></MemoryRouter>);
    expect(screen.getByRole('button', { name: /my mosaic/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /explore/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /community/i })).toBeInTheDocument();
  });

  it('highlights the active section', () => {
    render(
      <MemoryRouter initialEntries={['/my/stories']}>
        <BottomTabBar />
      </MemoryRouter>
    );
    const myMosaicBtn = screen.getByRole('button', { name: /my mosaic/i });
    expect(myMosaicBtn.className).toContain('text-theme-primary');
  });

  it('highlights explore section for explore paths', () => {
    render(
      <MemoryRouter initialEntries={['/explore/legacies']}>
        <BottomTabBar />
      </MemoryRouter>
    );
    const exploreBtn = screen.getByRole('button', { name: /explore/i });
    expect(exploreBtn.className).toContain('text-theme-primary');
  });
});
