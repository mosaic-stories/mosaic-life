import DiffMatchPatch from 'diff-match-patch';

export interface DiffSegment {
  type: 'equal' | 'insert' | 'delete';
  text: string;
}

const dmp = new DiffMatchPatch();

/**
 * Compute a semantic diff between original and rewritten text.
 * Returns an array of segments typed as equal, insert, or delete.
 */
export function computeDiff(original: string, rewrite: string): DiffSegment[] {
  const diffs = dmp.diff_main(original, rewrite);
  dmp.diff_cleanupSemantic(diffs);

  return diffs.map(([op, text]) => ({
    type: op === 0 ? 'equal' : op === 1 ? 'insert' : 'delete',
    text,
  }));
}
