import { useEffect, useState } from 'react';
import { PenLine, type LucideIcon } from 'lucide-react';

interface MetadataRowProps {
  label: string;
  value: string | null | undefined;
  icon?: LucideIcon;
  editable?: boolean;
  placeholder?: string;
  onSave?: (value: string) => void;
}

export default function MetadataRow({
  label,
  value,
  icon: Icon,
  editable = false,
  placeholder,
  onSave,
}: MetadataRowProps) {
  const [editing, setEditing] = useState(false);
  const [localValue, setLocalValue] = useState(value || '');
  const isEmpty = !value;

  useEffect(() => {
    if (!editing) {
      setLocalValue(value || '');
    }
  }, [editing, value]);

  const handleBlur = () => {
    setEditing(false);
    if (localValue !== (value || '')) {
      onSave?.(localValue);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    }
    if (e.key === 'Escape') {
      setLocalValue(value || '');
      setEditing(false);
    }
  };

  return (
    <div className="flex items-start gap-2.5 py-1.5">
      {Icon && <Icon size={14} className="text-neutral-400 mt-0.5 shrink-0" />}
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-medium text-neutral-400 mb-0.5">{label}</div>
        {editing ? (
          <input
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            autoFocus
            className="text-sm text-neutral-900 border border-stone-300 rounded-md px-2 py-1 w-full outline-none focus:ring-1 focus:ring-stone-400 bg-stone-50"
          />
        ) : (
          <div
            onClick={() => editable && setEditing(true)}
            className={`text-sm leading-relaxed ${
              isEmpty ? 'text-neutral-400 italic' : 'text-neutral-900'
            } ${editable ? 'cursor-pointer hover:text-neutral-700' : ''}`}
          >
            {value || placeholder || 'Add...'}
            {editable && !isEmpty && (
              <PenLine size={10} className="inline ml-1.5 text-neutral-300" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
