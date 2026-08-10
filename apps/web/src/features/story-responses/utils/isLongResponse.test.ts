import { describe, it, expect } from 'vitest';
import { isLongResponse } from './isLongResponse';

describe('isLongResponse', () => {
  it('returns false for exactly four sentences', () => {
    expect(isLongResponse('One. Two. Three. Four.')).toBe(false);
  });

  it('returns true for five sentences', () => {
    expect(isLongResponse('One. Two. Three. Four. Five.')).toBe(true);
  });

  it('returns false for an empty string', () => {
    expect(isLongResponse('')).toBe(false);
  });

  it('returns false for whitespace only', () => {
    expect(isLongResponse('   \n  ')).toBe(false);
  });

  it('ignores trailing whitespace around the terminal punctuation', () => {
    expect(isLongResponse('One.   Two.  Three. Four.   ')).toBe(false);
    expect(isLongResponse('One.   Two.  Three. Four. Five.   ')).toBe(true);
  });

  it('counts a final sentence with no terminal punctuation', () => {
    // Four proper sentences plus a fifth, unterminated fragment - still counts
    // as five non-empty segments.
    expect(isLongResponse('One. Two. Three. Four. And a fifth without punctuation')).toBe(true);
  });

  it('does not count doubled-up terminators as extra sentences', () => {
    // "Wait..." + "Really?!" + two more should be four segments, not more,
    // because consecutive terminators collapse via the `+` in the split regex.
    expect(isLongResponse('Wait... Really?! One more. And another.')).toBe(false);
  });

  it('treats a single unterminated sentence as one, not long', () => {
    expect(isLongResponse('Just one thought with no punctuation')).toBe(false);
  });
});
