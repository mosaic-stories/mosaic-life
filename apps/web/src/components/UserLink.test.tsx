import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import UserLink from './UserLink';

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('UserLink', () => {
  it('renders display name as a link to /u/{username}', () => {
    renderWithRouter(
      <UserLink username="joe-smith-a1b2" displayName="Joe Smith" />
    );
    const link = screen.getByRole('link', { name: 'Joe Smith' });
    expect(link).toHaveAttribute('href', '/u/joe-smith-a1b2');
  });

  it('does not render avatar by default', () => {
    renderWithRouter(
      <UserLink username="joe-smith-a1b2" displayName="Joe Smith" avatarUrl="https://example.com/avatar.jpg" />
    );
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('renders avatar when showAvatar is true', () => {
    const { container } = renderWithRouter(
      <UserLink
        username="joe-smith-a1b2"
        displayName="Joe Smith"
        avatarUrl="https://example.com/avatar.jpg"
        showAvatar
      />
    );
    expect(container.querySelector('[data-slot="avatar"]')).toBeInTheDocument();
  });

  it('applies a custom avatar className', () => {
    const { container } = renderWithRouter(
      <UserLink
        username="joe-smith-a1b2"
        displayName="Joe Smith"
        showAvatar
        avatarClassName="size-10"
      />
    );
    expect(container.querySelector('[data-slot="avatar"]')).toHaveClass('size-10');
  });

  it('renders initials fallback when showAvatar is true but no avatarUrl', () => {
    renderWithRouter(
      <UserLink username="joe-smith-a1b2" displayName="Joe Smith" showAvatar />
    );
    expect(screen.getByText('JS')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    renderWithRouter(
      <UserLink username="joe-smith-a1b2" displayName="Joe Smith" className="text-lg" />
    );
    const link = screen.getByRole('link');
    expect(link.className).toContain('text-lg');
  });

  it('stops click propagation to prevent parent card navigation', () => {
    const onClick = vi.fn();
    renderWithRouter(
      <div onClick={onClick}>
        <UserLink username="joe-smith-a1b2" displayName="Joe Smith" />
      </div>
    );
    const link = screen.getByRole('link');
    fireEvent.click(link);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('stops Enter and Space key propagation to protect parent keyboard navigation', () => {
    const onKeyDown = vi.fn();
    renderWithRouter(
      <div onKeyDown={onKeyDown}>
        <UserLink username="joe-smith-a1b2" displayName="Joe Smith" />
      </div>
    );
    const link = screen.getByRole('link');
    fireEvent.keyDown(link, { key: 'Enter' });
    fireEvent.keyDown(link, { key: ' ' });
    expect(onKeyDown).not.toHaveBeenCalled();
  });
});
