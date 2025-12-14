import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HeaderOverflowMenu from './HeaderOverflowMenu';

describe('HeaderOverflowMenu', () => {
  it('renders nothing when no children provided', () => {
    const { container } = render(<HeaderOverflowMenu>{null}</HeaderOverflowMenu>);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders overflow button when children provided', () => {
    render(
      <HeaderOverflowMenu>
        <button>Test Action</button>
      </HeaderOverflowMenu>
    );

    expect(screen.getByRole('button', { name: /more options/i })).toBeInTheDocument();
  });

  it('shows children in dropdown when clicked', async () => {
    const user = userEvent.setup();
    render(
      <HeaderOverflowMenu>
        <button>Test Action</button>
      </HeaderOverflowMenu>
    );

    await user.click(screen.getByRole('button', { name: /more options/i }));

    await waitFor(() => {
      expect(screen.getByText('Test Action')).toBeInTheDocument();
    });
  });
});
