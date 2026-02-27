import { useMemo } from 'react';
import { computeDiff, type DiffSegment } from '../utils/diffEngine';

interface DiffViewProps {
  original: string;
  rewrite: string;
}

export function DiffView({ original, rewrite }: DiffViewProps) {
  const segments = useMemo(() => computeDiff(original, rewrite), [original, rewrite]);

  return (
    <div className="px-6 py-4 font-serif text-base leading-relaxed whitespace-pre-wrap">
      {segments.map((segment, i) => (
        <DiffSegmentSpan key={i} segment={segment} />
      ))}
    </div>
  );
}

function DiffSegmentSpan({ segment }: { segment: DiffSegment }) {
  switch (segment.type) {
    case 'equal':
      return <span>{segment.text}</span>;
    case 'insert':
      return (
        <span className="bg-emerald-100 text-emerald-800 decoration-emerald-400">
          {segment.text}
        </span>
      );
    case 'delete':
      return (
        <span className="bg-red-100 text-red-800 line-through decoration-red-400">
          {segment.text}
        </span>
      );
  }
}
