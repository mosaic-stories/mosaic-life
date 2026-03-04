import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ConnectionsPage from './ConnectionsPage';

describe('ConnectionsPage', () => {
  it('renders the placeholder heading and description', () => {
    render(<MemoryRouter><ConnectionsPage /></MemoryRouter>);
    expect(screen.getByText('Connections')).toBeInTheDocument();
    expect(screen.getByText(/personas, people, and conversations/i)).toBeInTheDocument();
  });

  it('renders a link back to home', () => {
    render(<MemoryRouter><ConnectionsPage /></MemoryRouter>);
    expect(screen.getByRole('link', { name: /go to home/i })).toHaveAttribute('href', '/');
  });
});
