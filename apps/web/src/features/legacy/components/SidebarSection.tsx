import { useState } from 'react';
import { ChevronRight } from 'lucide-react';

interface SidebarSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export default function SidebarSection({ title, defaultOpen = true, children }: SidebarSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="mb-6">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full pb-2.5 border-b border-stone-200 cursor-pointer"
      >
        <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
          {title}
        </span>
        <ChevronRight
          size={14}
          className={`text-neutral-300 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
        />
      </button>
      {open && <div className="mt-3.5">{children}</div>}
    </div>
  );
}
