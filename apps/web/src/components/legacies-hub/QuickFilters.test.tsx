import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuickFilters from './QuickFilters';

const options = [
  { key: 'all', label: 'All', count: 8 },
  { key: 'mine', label: 'Mine', count: 3 },
  { key: 'shared', label: 'Shared', count: 5 },
];

describe('QuickFilters', () => {
  it('renders all filter options', () => {
    render(<QuickFilters options={options} activeKey="all" onChange={() => {}} />);
    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('Mine')).toBeInTheDocument();
    expect(screen.getByText('Shared')).toBeInTheDocument();
  });

  it('sets aria-pressed on active filter', () => {
    render(<QuickFilters options={options} activeKey="mine" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: /mine/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /all/i })).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onChange when a filter is clicked', async () => {
    const onChange = vi.fn();
    render(<QuickFilters options={options} activeKey="all" onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: /shared/i }));
    expect(onChange).toHaveBeenCalledWith('shared');
  });

  it('renders counts when provided', () => {
    render(<QuickFilters options={options} activeKey="all" onChange={() => {}} />);
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});
