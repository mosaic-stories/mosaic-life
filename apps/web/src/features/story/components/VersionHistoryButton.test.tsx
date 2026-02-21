import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VersionHistoryButton from './VersionHistoryButton';

describe('VersionHistoryButton', () => {
  it('renders nothing when versionCount is 1', () => {
    const { container } = render(
      <VersionHistoryButton versionCount={1} onClick={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when versionCount is null', () => {
    const { container } = render(
      <VersionHistoryButton versionCount={null} onClick={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders button when versionCount > 1', () => {
    render(
      <VersionHistoryButton versionCount={3} onClick={vi.fn()} />
    );
    expect(screen.getByRole('button', { name: /history/i })).toBeInTheDocument();
  });

  it('calls onClick when clicked', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(
      <VersionHistoryButton versionCount={3} onClick={handleClick} />
    );

    await user.click(screen.getByRole('button', { name: /history/i }));
    expect(handleClick).toHaveBeenCalledOnce();
  });
});
