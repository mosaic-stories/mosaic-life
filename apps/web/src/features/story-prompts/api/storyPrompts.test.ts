import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}));

vi.mock('@/lib/api/client', () => ({
  apiGet: mocks.apiGet,
  apiPost: mocks.apiPost,
}));

import { getCurrentPrompt, shufflePrompt } from './storyPrompts';

describe('story prompt API wrappers', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset();
    mocks.apiPost.mockReset();
  });

  it('maps a 204 current prompt response to null', async () => {
    mocks.apiGet.mockResolvedValue(undefined);

    await expect(getCurrentPrompt()).resolves.toBeNull();
  });

  it('maps a 204 shuffle response to null', async () => {
    mocks.apiPost.mockResolvedValue(undefined);

    await expect(shufflePrompt('prompt-1')).resolves.toBeNull();
  });
});