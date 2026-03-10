import { useState } from 'react';
import { X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface TagInputProps {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  maxItems?: number;
  maxLength?: number;
  id?: string;
}

export default function TagInput({
  values,
  onChange,
  placeholder = 'Type and press Enter...',
  maxItems,
  maxLength = 100,
  id,
}: TagInputProps) {
  const [input, setInput] = useState('');

  const atMax = maxItems !== undefined && values.length >= maxItems;

  const addTag = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    if (values.some((v) => v.toLowerCase() === trimmed.toLowerCase())) {
      setInput('');
      return;
    }
    if (atMax) return;
    onChange([...values, trimmed]);
    setInput('');
  };

  const removeTag = (tag: string) => {
    onChange(values.filter((v) => v !== tag));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag();
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          id={id}
          placeholder={atMax ? `Maximum ${maxItems} reached` : placeholder}
          value={input}
          onChange={(e) => setInput(e.target.value.slice(0, maxLength))}
          onKeyDown={handleKeyDown}
          disabled={atMax}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addTag}
          disabled={!input.trim() || atMax}
        >
          Add
        </Button>
      </div>
      {maxItems !== undefined && values.length > 0 && (
        <p className="text-xs text-neutral-400">
          {values.length}/{maxItems}
        </p>
      )}
      {values.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {values.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 px-3 py-1 bg-theme-accent-light text-theme-primary text-sm rounded-full"
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="hover:text-red-500 transition-colors"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
