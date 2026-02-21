import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VersionHistoryDrawer from './VersionHistoryDrawer';
import type { VersionSummary, VersionListResponse } from '@/features/story/api/versions';

// Radix ScrollArea uses ResizeObserver which is not available in jsdom
beforeAll(() => {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const activeVersion: VersionSummary = {
  version_number: 3,
  status: 'active',
  source: 'edit',
  source_version: null,
  change_summary: 'Updated introduction',
  stale: false,
  created_by: 'user-1',
  created_at: '2026-02-16T12:00:00Z',
};

const inactiveVersion: VersionSummary = {
  version_number: 2,
  status: 'inactive',
  source: 'edit',
  source_version: null,
  change_summary: 'Added conclusion',
  stale: false,
  created_by: 'user-1',
  created_at: '2026-02-15T10:00:00Z',
};

const draftVersion: VersionSummary = {
  version_number: 4,
  status: 'draft',
  source: 'ai_generate',
  source_version: 3,
  change_summary: 'AI-enhanced introduction',
  stale: false,
  created_by: 'user-1',
  created_at: '2026-02-16T14:00:00Z',
};

const baseData: VersionListResponse = {
  versions: [activeVersion, inactiveVersion],
  total: 2,
  page: 1,
  page_size: 20,
  warning: null,
};

describe('VersionHistoryDrawer', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    data: baseData,
    isLoading: false,
    selectedVersion: null as number | null,
    onSelectVersion: vi.fn(),
    onApproveDraft: vi.fn(),
    onDiscardDraft: vi.fn(),
    isDraftActionPending: false,
  };

  it('renders title "Version History"', () => {
    render(<VersionHistoryDrawer {...defaultProps} />);
    expect(screen.getByText('Version History')).toBeInTheDocument();
  });

  it('renders version entries from data', () => {
    render(<VersionHistoryDrawer {...defaultProps} />);
    expect(screen.getByText('v3')).toBeInTheDocument();
    expect(screen.getByText('v2')).toBeInTheDocument();
  });

  it('shows Active badge on active version', () => {
    render(<VersionHistoryDrawer {...defaultProps} />);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('shows change summary text', () => {
    render(<VersionHistoryDrawer {...defaultProps} />);
    expect(screen.getByText('Updated introduction')).toBeInTheDocument();
    expect(screen.getByText('Added conclusion')).toBeInTheDocument();
  });

  it('calls onSelectVersion when a version entry is clicked', async () => {
    const user = userEvent.setup();
    const handleSelect = vi.fn();
    render(
      <VersionHistoryDrawer {...defaultProps} onSelectVersion={handleSelect} />
    );

    await user.click(screen.getByText('v2'));
    expect(handleSelect).toHaveBeenCalledWith(2);
  });

  it('highlights the selected version', () => {
    render(
      <VersionHistoryDrawer {...defaultProps} selectedVersion={2} />
    );
    const selectedEntry = screen.getByText('v2').closest('[data-selected]');
    expect(selectedEntry).toHaveAttribute('data-selected', 'true');
  });

  it('renders draft zone when draft version exists', () => {
    const dataWithDraft: VersionListResponse = {
      ...baseData,
      versions: [draftVersion, activeVersion, inactiveVersion],
      total: 3,
    };
    render(
      <VersionHistoryDrawer {...defaultProps} data={dataWithDraft} />
    );
    expect(screen.getByText(/draft/i)).toBeInTheDocument();
    expect(screen.getByText('Approve')).toBeInTheDocument();
    expect(screen.getByText('Discard')).toBeInTheDocument();
  });

  it('shows warning banner when warning is present', () => {
    const dataWithWarning: VersionListResponse = {
      ...baseData,
      warning: 'This story has 55 versions. Consider removing old versions.',
    };
    render(
      <VersionHistoryDrawer {...defaultProps} data={dataWithWarning} />
    );
    expect(
      screen.getByText(/55 versions/i)
    ).toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(
      <VersionHistoryDrawer {...defaultProps} data={undefined} isLoading={true} />
    );
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('does not render draft zone when no draft exists', () => {
    render(<VersionHistoryDrawer {...defaultProps} />);
    expect(screen.queryByText('Approve')).not.toBeInTheDocument();
  });
});
