import { useEffect } from 'react';
import { EditorContent } from '@tiptap/react';
import { useStoryEditor } from '../hooks/useStoryEditor';
import EditorToolbar from './EditorToolbar';
import '../editor.css';

interface StoryEditorProps {
  content: string;
  onChange?: (html: string) => void;
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

  // Sync content from outside (e.g. loading existing story)
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
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
