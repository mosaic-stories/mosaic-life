import { useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onUpdate?.((e.storage as any).markdown.getMarkdown());
    },
    editorProps: {
      attributes: {
        class: 'prose prose-neutral max-w-none focus:outline-none min-h-[300px]',
      },
    },
  });

  return editor;
}
