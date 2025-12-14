import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import HeaderLogo from './HeaderLogo';

describe('HeaderLogo', () => {
  it('renders logo icon', () => {
    render(<HeaderLogo onNavigateHome={() => {}} />);

    expect(screen.getByRole('button', { name: /mosaic life/i })).toBeInTheDocument();
  });

  it('shows wordmark on desktop', () => {
    render(<HeaderLogo onNavigateHome={() => {}} />);

    expect(screen.getByText('Mosaic Life')).toBeInTheDocument();
  });

  it('calls onNavigateHome when clicked', () => {
    const handleNavigate = vi.fn();
    render(<HeaderLogo onNavigateHome={handleNavigate} />);

    fireEvent.click(screen.getByRole('button', { name: /mosaic life/i }));
    expect(handleNavigate).toHaveBeenCalled();
  });
});
