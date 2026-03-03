import { NavLink } from 'react-router-dom';
import { NAV_ITEMS } from '@/lib/navigation';

export default function BottomTabBar() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-neutral-200 md:hidden">
      <div className="flex items-center justify-around py-2">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 px-2 py-1 text-xs transition-colors ${
                  isActive
                    ? 'text-theme-primary'
                    : 'text-neutral-500 hover:text-neutral-700'
                }`
              }
            >
              <Icon className="size-5" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
