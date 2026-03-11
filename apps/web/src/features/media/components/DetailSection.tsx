import { useState, type ReactNode } from 'react';
import { ChevronRight, type LucideIcon } from 'lucide-react';

interface DetailSectionProps {
  title: string;
  icon: LucideIcon;
  children: ReactNode;
  action?: ReactNode;
  defaultOpen?: boolean;
}

export default function DetailSection({
  title,
  icon: Icon,
  children,
  action,
  defaultOpen = true,
}: DetailSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="mb-5">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full pb-2 border-b border-stone-200 cursor-pointer"
      >
        <div className="flex items-center gap-1.5">
          <Icon size={13} className="text-neutral-400" />
          <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
            {title}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {action && open && action}
          <ChevronRight
            size={13}
            className={`text-neutral-300 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
          />
        </div>
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}
