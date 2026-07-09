/**
 * Renders plain-text content (line breaks preserved, no HTML) safely.
 *
 * The codebase has no dedicated sanitizer utility and no DOMPurify/rehype
 * dependency (verified: no `dangerouslySetInnerHTML` usage anywhere in
 * apps/web/src except an unrelated chart internal). Response bodies are
 * plain text per the story-responses spec (server-side, `story_response.py`
 * already strips any HTML tags before persisting), so the safest and
 * simplest client-side approach is to never touch `dangerouslySetInnerHTML`
 * at all: pass the raw string as a React text child (JSX escapes text nodes
 * automatically) and let CSS `white-space: pre-wrap` preserve the author's
 * line breaks. This closes the "no HTML injection" requirement without
 * introducing a new dependency.
 */
interface PlainTextBodyProps {
  text: string;
  className?: string;
}

export default function PlainTextBody({ text, className = '' }: PlainTextBodyProps) {
  return (
    <p className={className} style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
      {text}
    </p>
  );
}
