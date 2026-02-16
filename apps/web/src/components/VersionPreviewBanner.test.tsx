import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VersionPreviewBanner from './VersionPreviewBanner';

describe('VersionPreviewBanner', () => {
  const defaultProps = {
    versionNumber: 2,
    source: 'edit',
    createdAt: '2026-02-15T10:00:00Z',
    isActive: false,
    onRestore: vi.fn(),
    isRestoring: false,
  };

  it('renders version number', () => {
    render(<VersionPreviewBanner {...defaultProps} />);
    expect(screen.getByText(/viewing version 2/i)).toBeInTheDocument();
  });

  it('renders source badge', () => {
    render(<VersionPreviewBanner {...defaultProps} />);
    expect(screen.getByText(/manual edit/i)).toBeInTheDocument();
  });

  it('shows Restore button for non-active version', () => {
    render(<VersionPreviewBanner {...defaultProps} />);
    expect(
      screen.getByRole('button', { name: /restore this version/i })
    ).toBeInTheDocument();
  });

  it('hides Restore button for active version', () => {
    render(<VersionPreviewBanner {...defaultProps} isActive={true} />);
    expect(
      screen.queryByRole('button', { name: /restore this version/i })
    ).not.toBeInTheDocument();
  });

  it('shows confirmation dialog on Restore click, calls onRestore on confirm', async () => {
    const user = userEvent.setup();
    const handleRestore = vi.fn();
    render(
      <VersionPreviewBanner {...defaultProps} onRestore={handleRestore} />
    );

    await user.click(
      screen.getByRole('button', { name: /restore this version/i })
    );

    // Dialog should appear
    expect(screen.getByText(/are you sure/i)).toBeInTheDocument();

    // Click confirm
    await user.click(screen.getByRole('button', { name: /^restore$/i }));
    expect(handleRestore).toHaveBeenCalledOnce();
  });

  it('closes dialog on cancel without calling onRestore', async () => {
    const user = userEvent.setup();
    const handleRestore = vi.fn();
    render(
      <VersionPreviewBanner {...defaultProps} onRestore={handleRestore} />
    );

    await user.click(
      screen.getByRole('button', { name: /restore this version/i })
    );
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(handleRestore).not.toHaveBeenCalled();
  });

  it('disables Restore button when isRestoring is true', () => {
    render(
      <VersionPreviewBanner {...defaultProps} isRestoring={true} />
    );
    expect(
      screen.getByRole('button', { name: /restoring/i })
    ).toBeDisabled();
  });
});
