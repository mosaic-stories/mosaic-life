import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useIsMobile } from '@/components/ui/use-mobile';
import SidebarNav from './SidebarNav';
import type { NavItem } from '@/lib/navigation';

const SIDEBAR_COLLAPSED_KEY = 'mosaic-sidebar-collapsed';

interface SidebarLayoutProps {
  items: NavItem[];
}

export default function SidebarLayout({ items }: SidebarLayoutProps) {
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(() => {
    const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    return stored === 'true';
  });

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
  }, [collapsed]);

  if (isMobile) {
    return <Outlet />;
  }

  return (
    <div className="flex min-h-[calc(100vh-57px)]">
      <div className="sticky top-[57px] h-[calc(100vh-57px)] shrink-0">
        <SidebarNav
          items={items}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((c) => !c)}
        />
      </div>
      <main className="flex-1 min-w-0">
        <Outlet />
      </main>
    </div>
  );
}
