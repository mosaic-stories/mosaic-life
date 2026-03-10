import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import ProfileSettings from './ProfileSettings';

const mocks = vi.hoisted(() => ({
  profile: {
    id: 'user-1',
    email: 'alex@example.com',
    name: 'Alex Example',
    bio: 'Hello there',
    gender: 'male',
    avatar_url: null,
    created_at: '2026-03-10T00:00:00Z',
  },
  mutate: vi.fn(),
}));

vi.mock('@/features/settings/hooks/useSettings', async () => {
  const actual = await vi.importActual<typeof import('@/features/settings/hooks/useSettings')>(
    '@/features/settings/hooks/useSettings'
  );

  return {
    ...actual,
    useProfile: () => ({ data: mocks.profile, isLoading: false }),
    useUpdateProfile: () => ({ mutate: mocks.mutate, isPending: false }),
  };
});

describe('ProfileSettings', () => {
  beforeEach(() => {
    mocks.mutate.mockReset();
  });

  it('sends null when gender is cleared', async () => {
    const user = userEvent.setup();

    render(<ProfileSettings />);

    await user.selectOptions(screen.getByLabelText('Gender (optional)'), '');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => {
      expect(mocks.mutate).toHaveBeenCalledWith(
        {
          name: 'Alex Example',
          bio: 'Hello there',
          gender: null,
        },
        expect.objectContaining({ onSuccess: expect.any(Function) })
      );
    });
  });
});