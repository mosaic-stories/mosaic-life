import { ArrowRight, ClipboardList, Loader2, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/components/ui/utils';

interface SummaryCheckpointProps {
  summaryText: string;
  onApprove: () => void;
  onContinueChat: () => void;
  isAdvancing?: boolean;
}

function parseBoldSegments(text: string): Array<{ text: string; bold: boolean }> {
  const parts: Array<{ text: string; bold: boolean }> = [];
  const regex = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, match.index), bold: false });
    }
    parts.push({ text: match[1], bold: true });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), bold: false });
  }

  return parts;
}

interface ParsedLine {
  type: 'section-header' | 'bullet' | 'text' | 'empty';
  content: string;
  boldParts: Array<{ text: string; bold: boolean }>;
}

function parseLine(raw: string): ParsedLine {
  const trimmed = raw.trim();

  if (trimmed === '') {
    return { type: 'empty', content: '', boldParts: [] };
  }

  if (/^\*\*[^*]+\*\*/.test(trimmed)) {
    return {
      type: 'section-header',
      content: trimmed,
      boldParts: parseBoldSegments(trimmed),
    };
  }

  if (/^[-*]\s+/.test(trimmed)) {
    const content = trimmed.replace(/^[-*]\s+/, '');
    return {
      type: 'bullet',
      content,
      boldParts: parseBoldSegments(content),
    };
  }

  return {
    type: 'text',
    content: trimmed,
    boldParts: parseBoldSegments(trimmed),
  };
}

function InlineText({ parts }: { parts: Array<{ text: string; bold: boolean }> }) {
  return (
    <>
      {parts.map((part, i) =>
        part.bold ? (
          <strong key={i} className="font-semibold text-foreground">
            {part.text}
          </strong>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </>
  );
}

function RenderedSummary({ text }: { text: string }) {
  const rawLines = text.split('\n');
  const parsed = rawLines.map(parseLine);

  const elements: React.ReactNode[] = [];
  let bulletBuffer: ParsedLine[] = [];
  let sectionCount = 0;

  function flushBullets(key: string) {
    if (bulletBuffer.length === 0) return;
    elements.push(
      <ul key={`bullets-${key}`} className="mt-1.5 space-y-1 pl-4">
        {bulletBuffer.map((b, i) => (
          <li
            key={i}
            className="relative pl-3 before:absolute before:left-0 before:top-2 before:size-1.5 before:rounded-full before:bg-muted-foreground/50"
          >
            <InlineText parts={b.boldParts} />
          </li>
        ))}
      </ul>
    );
    bulletBuffer = [];
  }

  parsed.forEach((line, i) => {
    if (line.type === 'bullet') {
      bulletBuffer.push(line);
      return;
    }

    flushBullets(`pre-${i}`);

    if (line.type === 'empty') return;

    if (line.type === 'section-header') {
      if (sectionCount > 0) {
        elements.push(<Separator key={`sep-${i}`} className="my-3" />);
      }
      elements.push(
        <div key={`header-${i}`} className="text-sm font-medium text-muted-foreground">
          <InlineText parts={line.boldParts} />
        </div>
      );
      sectionCount++;
      return;
    }

    elements.push(
      <p key={`text-${i}`} className="text-sm leading-relaxed">
        <InlineText parts={line.boldParts} />
      </p>
    );
  });

  flushBullets('end');

  return <div className="space-y-1">{elements}</div>;
}

export function SummaryCheckpoint({
  summaryText,
  onApprove,
  onContinueChat,
  isAdvancing = false,
}: SummaryCheckpointProps) {
  return (
    <Card className={cn('w-full shadow-sm')}>
      <CardHeader className="border-b pb-4">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <ClipboardList className="size-4 text-muted-foreground" />
          Conversation Summary
        </CardTitle>
      </CardHeader>

      <CardContent className="pt-5">
        <div className="font-serif text-sm leading-relaxed text-foreground/90">
          <RenderedSummary text={summaryText} />
        </div>

        <Separator className="mt-6" />

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            onClick={onApprove}
            disabled={isAdvancing}
            className="flex-1 sm:flex-none"
          >
            {isAdvancing ? (
              <Loader2 className="animate-spin" />
            ) : (
              <ArrowRight />
            )}
            Looks good, choose style
          </Button>

          <Button
            variant="outline"
            onClick={onContinueChat}
            disabled={isAdvancing}
            className="flex-1 sm:flex-none"
          >
            <MessageSquare />
            I want to add more
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
