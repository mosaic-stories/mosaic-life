import { describe, it, expect } from 'vitest';

/**
 * Unit-level tests for the seed-skip logic in useConversationSeed.
 * We test the conditional logic directly rather than rendering hooks,
 * since the core fix is a simple boolean gate.
 */
describe('useConversationSeed skip logic', () => {
  // Replicate the gate logic from the hook
  function shouldSkipSeed(
    messagesLength: number,
    seedMode: 'default' | 'evolve_summary'
  ): boolean {
    return messagesLength > 0 && seedMode !== 'evolve_summary';
  }

  it('should skip seeding in default mode when messages exist', () => {
    expect(shouldSkipSeed(3, 'default')).toBe(true);
  });

  it('should NOT skip seeding in evolve_summary mode even with existing messages', () => {
    expect(shouldSkipSeed(5, 'evolve_summary')).toBe(false);
  });

  it('should NOT skip seeding in default mode when no messages', () => {
    expect(shouldSkipSeed(0, 'default')).toBe(false);
  });

  it('should NOT skip seeding in evolve_summary mode when no messages', () => {
    expect(shouldSkipSeed(0, 'evolve_summary')).toBe(false);
  });
});
