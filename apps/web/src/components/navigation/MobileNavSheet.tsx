import { NavLink, useLocation } from 'react-router-dom';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/components/ui/utils';
import type { NavItem } from '@/lib/navigation';

interface MobileNavSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  items: NavItem[];
}

export default function MobileNavSheet({ open, onOpenChange, title, items }: MobileNavSheetProps) {
  const { pathname } = useLocation();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl pb-8">
        <SheetHeader>
          <SheetTitle className="text-left">{title}</SheetTitle>
        </SheetHeader>
        <nav className="mt-4 flex flex-col gap-1">
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.path || pathname.startsWith(item.path + '/');
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => onOpenChange(false)}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-4 py-3 text-base font-medium transition-colors',
                  isActive
                    ? 'bg-theme-accent-light text-theme-primary'
                    : 'text-neutral-600 hover:bg-neutral-100',
                )}
              >
                <Icon className="size-5" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
