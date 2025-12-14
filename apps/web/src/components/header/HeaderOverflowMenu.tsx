import { MoreHorizontal } from 'lucide-react';
import { ReactNode } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface HeaderOverflowMenuProps {
  children: ReactNode;
}

export default function HeaderOverflowMenu({ children }: HeaderOverflowMenuProps) {
  if (!children) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="p-2 rounded-full hover:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--theme-primary))] focus:ring-offset-2 transition-all"
          aria-label="More options"
        >
          <MoreHorizontal className="size-5 text-neutral-600" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" sideOffset={8} className="p-2 min-w-[200px]">
        <div className="flex flex-col gap-2">{children}</div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
