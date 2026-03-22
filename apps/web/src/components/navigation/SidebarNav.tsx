import { NavLink } from 'react-router-dom';
import { PanelLeftClose, PanelLeft } from 'lucide-react';
import { cn } from '@/components/ui/utils';
import type { NavItem } from '@/lib/navigation';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface SidebarNavProps {
  items: NavItem[];
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export default function SidebarNav({ items, collapsed, onToggleCollapse }: SidebarNavProps) {
  return (
    <aside
      className={cn(
        'flex flex-col h-full border-r bg-neutral-50/80 transition-[width] duration-200 ease-in-out shrink-0',
        collapsed ? 'w-[60px]' : 'w-[200px]',
      )}
    >
      <nav className="flex-1 flex flex-col gap-1 p-2 pt-4">
        {items.map((item) => {
          const Icon = item.icon;
          const link = (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-theme-accent-light text-theme-primary'
                    : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900',
                  collapsed && 'justify-center px-0',
                )
              }
            >
              <Icon className="size-5 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          );

          if (collapsed) {
            return (
              <Tooltip key={item.path}>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            );
          }

          return link;
        })}
      </nav>
      <button
        onClick={onToggleCollapse}
        className="flex items-center justify-center p-3 text-neutral-400 hover:text-neutral-600 transition-colors border-t"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <PanelLeft className="size-5" /> : <PanelLeftClose className="size-5" />}
      </button>
    </aside>
  );
}
