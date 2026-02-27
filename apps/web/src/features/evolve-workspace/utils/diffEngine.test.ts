import { describe, it, expect } from 'vitest';
import { computeDiff, type DiffSegment } from './diffEngine';

describe('diffEngine', () => {
  it('returns single equal segment for identical text', () => {
    const result = computeDiff('hello world', 'hello world');
    expect(result).toEqual([{ type: 'equal', text: 'hello world' }]);
  });

  it('detects inserted text', () => {
    const result = computeDiff('hello world', 'hello beautiful world');
    const inserted = result.filter((s) => s.type === 'insert');
    expect(inserted.length).toBeGreaterThan(0);
    expect(inserted.some((s) => s.text.includes('beautiful'))).toBe(true);
  });

  it('detects deleted text', () => {
    const result = computeDiff('hello beautiful world', 'hello world');
    const deleted = result.filter((s) => s.type === 'delete');
    expect(deleted.length).toBeGreaterThan(0);
    expect(deleted.some((s) => s.text.includes('beautiful'))).toBe(true);
  });

  it('handles empty original', () => {
    const result = computeDiff('', 'new content');
    expect(result).toEqual([{ type: 'insert', text: 'new content' }]);
  });

  it('handles empty rewrite', () => {
    const result = computeDiff('old content', '');
    expect(result).toEqual([{ type: 'delete', text: 'old content' }]);
  });

  it('handles multi-line diffs', () => {
    const original = 'line one\nline two\nline three';
    const rewrite = 'line one\nline TWO\nline three';
    const result = computeDiff(original, rewrite);
    expect(result.length).toBeGreaterThan(1);
  });
});
