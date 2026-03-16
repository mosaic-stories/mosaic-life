import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import MetadataRow from './MetadataRow';
import UserLink from '@/components/UserLink';

describe('MetadataRow', () => {
  it('syncs the displayed value when the prop changes while not editing', () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <MetadataRow
        label="Location"
        value="Chicago"
        editable
      />
    );

    expect(screen.getByText('Chicago')).toBeInTheDocument();

    rerender(
      <MetadataRow
        label="Location"
        value="Seattle"
        editable
      />
    );

    expect(screen.getByText('Seattle')).toBeInTheDocument();

    return user.click(screen.getByText('Seattle')).then(() => {
      expect(screen.getByDisplayValue('Seattle')).toBeInTheDocument();
    });
  });

  it('does not overwrite the in-progress local value while editing', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <MetadataRow
        label="Location"
        value="Chicago"
        editable
      />
    );

    await user.click(screen.getByText('Chicago'));
    const input = screen.getByDisplayValue('Chicago');
    await user.clear(input);
    await user.type(input, 'Denver');

    rerender(
      <MetadataRow
        label="Location"
        value="Seattle"
        editable
      />
    );

    expect(screen.getByDisplayValue('Denver')).toBeInTheDocument();
  });

  it('renders React node values without coercing them to plain text', () => {
    render(
      <MemoryRouter>
        <MetadataRow
          label="Uploaded by"
          value={<UserLink username="pat-doe" displayName="Pat Doe" />}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: 'Pat Doe' })).toHaveAttribute('href', '/u/pat-doe');
  });
});
