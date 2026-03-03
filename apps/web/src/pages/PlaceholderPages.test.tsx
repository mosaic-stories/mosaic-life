import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import StoriesPage from './StoriesPage';
import ConversationsPage from './ConversationsPage';

describe('StoriesPage', () => {
  it('renders the placeholder heading and description', () => {
    render(<MemoryRouter><StoriesPage /></MemoryRouter>);
    expect(screen.getByText('Stories')).toBeInTheDocument();
    expect(screen.getByText(/browse and manage your stories/i)).toBeInTheDocument();
  });

  it('renders a link back to home', () => {
    render(<MemoryRouter><StoriesPage /></MemoryRouter>);
    expect(screen.getByRole('link', { name: /go to home/i })).toHaveAttribute('href', '/');
  });
});

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
