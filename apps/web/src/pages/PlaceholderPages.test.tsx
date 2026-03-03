import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ConversationsPage from './ConversationsPage';

describe('ConversationsPage', () => {
  it('renders the placeholder heading and description', () => {
    render(<MemoryRouter><ConversationsPage /></MemoryRouter>);
    expect(screen.getByText('Conversations')).toBeInTheDocument();
    expect(screen.getByText(/ai conversations and story evolution/i)).toBeInTheDocument();
  });

  it('renders a link back to home', () => {
    render(<MemoryRouter><ConversationsPage /></MemoryRouter>);
    expect(screen.getByRole('link', { name: /go to home/i })).toHaveAttribute('href', '/');
  });
});
