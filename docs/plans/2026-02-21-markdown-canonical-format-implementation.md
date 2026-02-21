# Markdown Canonical Format Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Switch story content storage from HTML to Markdown by converting at the TipTap editor boundary and rendering Markdown directly everywhere else.

**Architecture:** TipTap's `@tiptap/markdown` extension handles Markdown ↔ ProseMirror conversion at the editor boundary. All other consumers (evolution workspace panels, LLM prompts, chunking, embedding) work with Markdown natively. Vercel's `streamdown` renders Markdown in non-editor read-only contexts, with streaming support for SSE draft generation.

**Tech Stack:** `@tiptap/markdown` (editor serialization), `streamdown` (Markdown rendering for evolution panels)

**Design Doc:** [docs/plans/2026-02-21-markdown-canonical-format-design.md](2026-02-21-markdown-canonical-format-design.md)

---

### Task 1: Install Dependencies

**Files:**
- Modify: `apps/web/package.json`

**Step 1: Install packages**

Run from `apps/web/`:
```bash
npm install @tiptap/markdown streamdown
```

**Step 2: Verify installation**

Run: `ls node_modules/@tiptap/markdown/dist && ls node_modules/streamdown/dist`
Expected: Files listed (packages installed correctly)

**Step 3: Commit**

```bash
git add apps/web/package.json apps/web/package-lock.json
git commit -m "chore: add @tiptap/markdown and streamdown dependencies"
```

---

### Task 2: Add Markdown Extension to TipTap Editor Hook

**Files:**
- Modify: `apps/web/src/features/editor/hooks/useStoryEditor.ts`

This is the core change. The hook currently calls `e.getHTML()` on update and accepts HTML content. We switch to `Markdown` extension and `e.getMarkdown()`.

**Step 1: Update the hook**

Replace the full contents of `apps/web/src/features/editor/hooks/useStoryEditor.ts` with:

```typescript
import { useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';

interface UseStoryEditorOptions {
  content?: string;
  editable?: boolean;
  placeholder?: string;
  onUpdate?: (markdown: string) => void;
}

export function useStoryEditor({
  content = '',
  editable = true,
  placeholder = 'Start writing your story here...',
  onUpdate,
}: UseStoryEditorOptions = {}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Markdown,
      Placeholder.configure({ placeholder }),
      Image.configure({ inline: false, allowBase64: false }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
    ],
    content,
    editable,
    onUpdate: ({ editor: e }) => {
      onUpdate?.(e.getMarkdown());
    },
    editorProps: {
      attributes: {
        class: 'prose prose-neutral max-w-none focus:outline-none min-h-[300px]',
      },
    },
  });

  return editor;
}
```

Key changes from original:
- Added `import { Markdown } from '@tiptap/markdown'`
- Added `Markdown` to extensions array
- Changed `e.getHTML()` → `e.getMarkdown()` on line 36
- Changed `onUpdate` callback param name from `html` to `markdown` for clarity

**Step 2: Verify TypeScript compiles**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors related to `useStoryEditor.ts`

---

### Task 3: Update StoryEditor Content Sync

**Files:**
- Modify: `apps/web/src/features/editor/components/StoryEditor.tsx`

The `useEffect` content sync currently compares against `editor.getHTML()`. Switch to `editor.getMarkdown()` and use `setContent` with Markdown content type.

**Step 1: Update the component**

Replace the full contents of `apps/web/src/features/editor/components/StoryEditor.tsx` with:

```typescript
import { useEffect } from 'react';
import { EditorContent } from '@tiptap/react';
import { useStoryEditor } from '../hooks/useStoryEditor';
import EditorToolbar from './EditorToolbar';
import '../editor.css';

interface StoryEditorProps {
  content: string;
  onChange?: (markdown: string) => void;
  readOnly?: boolean;
  placeholder?: string;
}

export default function StoryEditor({
  content,
  onChange,
  readOnly = false,
  placeholder,
}: StoryEditorProps) {
  const editor = useStoryEditor({
    content,
    editable: !readOnly,
    placeholder,
    onUpdate: onChange,
  });

  // Sync content from outside (e.g. loading existing story, version preview)
  useEffect(() => {
    if (editor && content !== editor.getMarkdown()) {
      editor.commands.setContent(content, { contentType: 'markdown' });
    }
  }, [content, editor]);

  if (!editor) return null;

  return (
    <div className="story-editor rounded-lg border border-neutral-200 bg-white overflow-hidden focus-within:border-[rgb(var(--theme-primary))] focus-within:ring-2 focus-within:ring-[rgb(var(--theme-primary))]/20 transition-colors">
      {!readOnly && <EditorToolbar editor={editor} />}
      <div className={readOnly ? 'px-0 py-0' : 'px-6 py-4'}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
```

Key changes from original:
- `onChange` callback param name: `html` → `markdown`
- Content sync comparison: `editor.getHTML()` → `editor.getMarkdown()`
- Content sync setter: `editor.commands.setContent(content)` → `editor.commands.setContent(content, { contentType: 'markdown' })`

**Step 2: Verify TypeScript compiles**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/web/src/features/editor/
git commit -m "feat(editor): switch TipTap serialization from HTML to Markdown"
```

---

### Task 4: Update Evolution Workspace Original Story Panel

**Files:**
- Modify: `apps/web/src/features/story-evolution/StoryEvolutionWorkspace.tsx`

The left panel currently renders story content as raw text in a `whitespace-pre-wrap` div. Replace with `streamdown` in static mode.

**Step 1: Update the component**

Add import at the top of the file (after existing imports):
```typescript
import { Streamdown } from 'streamdown';
import 'streamdown/styles.css';
```

Replace the original story content div (lines 411-412 of current file):

Find this block:
```tsx
<div className="font-serif text-sm leading-relaxed text-foreground/80 whitespace-pre-wrap">
  {story?.content ?? ''}
</div>
```

Replace with:
```tsx
<div className="font-serif text-sm leading-relaxed text-foreground/80">
  <Streamdown mode="static">
    {story?.content ?? ''}
  </Streamdown>
</div>
```

**Step 2: Verify TypeScript compiles**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

---

### Task 5: Update DraftStreamPanel with Streamdown

**Files:**
- Modify: `apps/web/src/features/story-evolution/DraftStreamPanel.tsx`

Replace the `whitespace-pre-wrap` div with `streamdown` in streaming mode. The `isAnimating` prop handles the streaming caret indicator, replacing our manual blinking cursor.

**Step 1: Update the component**

Add import at the top (after existing imports):
```typescript
import { Streamdown } from 'streamdown';
import 'streamdown/styles.css';
```

Replace the content rendering block (lines 91-98 of current file):

Find this block:
```tsx
<Card className="p-6 bg-white">
  <div className="font-serif text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
    {streamedText}
    {isStreaming && (
      <span className="inline-block w-1.5 h-4 ml-0.5 bg-[rgb(var(--theme-primary))] animate-pulse" />
    )}
  </div>
</Card>
```

Replace with:
```tsx
<Card className="p-6 bg-white">
  <div className="font-serif text-sm leading-relaxed text-foreground/90">
    <Streamdown isAnimating={isStreaming} caret="block">
      {streamedText}
    </Streamdown>
  </div>
</Card>
```

**Step 2: Verify TypeScript compiles**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

---

### Task 6: Update DraftReviewPanel with Streamdown

**Files:**
- Modify: `apps/web/src/features/story-evolution/DraftReviewPanel.tsx`

Same pattern as DraftStreamPanel — replace raw text rendering with `streamdown`. The `isAnimating` prop activates during revision streaming.

**Step 1: Update the component**

Add import at the top (after existing imports):
```typescript
import { Streamdown } from 'streamdown';
import 'streamdown/styles.css';
```

Replace the content rendering block (lines 91-98 of current file):

Find this block:
```tsx
<Card className="p-6 bg-white">
  <div className="font-serif text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
    {displayContent}
    {isRevising && (
      <span className="inline-block w-1.5 h-4 ml-0.5 bg-[rgb(var(--theme-primary))] animate-pulse" />
    )}
  </div>
</Card>
```

Replace with:
```tsx
<Card className="p-6 bg-white">
  <div className="font-serif text-sm leading-relaxed text-foreground/90">
    <Streamdown isAnimating={isRevising} caret="block">
      {displayContent}
    </Streamdown>
  </div>
</Card>
```

**Step 2: Verify TypeScript compiles**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/web/src/features/story-evolution/
git commit -m "feat(evolution): render story content as Markdown with streamdown"
```

---

### Task 7: Update Vite Manual Chunks

**Files:**
- Modify: `apps/web/vite.config.ts`

Add `@tiptap/markdown` to the existing `tiptap` chunk so it bundles together.

**Step 1: Update vite config**

In the `manualChunks` object, update the `tiptap` entry:

Find:
```typescript
'tiptap': [
  '@tiptap/react',
  '@tiptap/starter-kit',
  '@tiptap/pm',
],
```

Replace with:
```typescript
'tiptap': [
  '@tiptap/react',
  '@tiptap/starter-kit',
  '@tiptap/pm',
  '@tiptap/markdown',
],
```

**Step 2: Commit**

```bash
git add apps/web/vite.config.ts
git commit -m "chore: add @tiptap/markdown to tiptap vendor chunk"
```

---

### Task 8: Full Verification

**Step 1: Run TypeScript check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: Zero errors

**Step 2: Run test suite**

Run: `cd apps/web && npm run test`
Expected: All 18 test files passing (119/119 tests)

**Step 3: Run production build**

Run: `cd apps/web && npx vite build`
Expected: Build succeeds. Verify `tiptap` chunk includes markdown extension in output.

**Step 4: Commit if any fixes were needed**

If any adjustments were required during verification, commit them:
```bash
git add -A
git commit -m "fix: address issues found during markdown format verification"
```
