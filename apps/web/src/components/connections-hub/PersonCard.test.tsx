import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PersonCard from './PersonCard';
import type { PersonConnection } from '@/features/connections/api/connections';

const mockPerson: PersonConnection = {
  user_id: '1',
  display_name: 'Sarah Chen',
  avatar_url: null,
  shared_legacy_count: 2,
  shared_legacies: [
    { legacy_id: 'l1', legacy_name: 'Margaret Chen', user_role: 'admin', connection_role: 'advocate' },
    { legacy_id: 'l2', legacy_name: 'James Torres', user_role: 'creator', connection_role: 'admirer' },
  ],
  highest_shared_role: 'advocate',
};

describe('PersonCard', () => {
  it('renders display name', () => {
    render(<PersonCard person={mockPerson} />);
    expect(screen.getByText('Sarah Chen')).toBeInTheDocument();
  });

  it('renders shared legacy count', () => {
    render(<PersonCard person={mockPerson} />);
    expect(screen.getByText('2 shared legacies')).toBeInTheDocument();
  });

  it('renders legacy names', () => {
    render(<PersonCard person={mockPerson} />);
    expect(screen.getByText('Margaret Chen')).toBeInTheDocument();
    expect(screen.getByText('James Torres')).toBeInTheDocument();
  });

  it('renders role badge', () => {
    render(<PersonCard person={mockPerson} />);
    expect(screen.getByText('advocate')).toBeInTheDocument();
  });

  it('shows overflow count for many legacies', () => {
    const manyLegacies: PersonConnection = {
      ...mockPerson,
      shared_legacy_count: 5,
      shared_legacies: [
        { legacy_id: 'l1', legacy_name: 'Legacy 1', user_role: 'admin', connection_role: 'advocate' },
        { legacy_id: 'l2', legacy_name: 'Legacy 2', user_role: 'admin', connection_role: 'advocate' },
        { legacy_id: 'l3', legacy_name: 'Legacy 3', user_role: 'admin', connection_role: 'advocate' },
        { legacy_id: 'l4', legacy_name: 'Legacy 4', user_role: 'admin', connection_role: 'advocate' },
        { legacy_id: 'l5', legacy_name: 'Legacy 5', user_role: 'admin', connection_role: 'advocate' },
      ],
    };
    render(<PersonCard person={manyLegacies} />);
    expect(screen.getByText('+2 more')).toBeInTheDocument();
  });
});
