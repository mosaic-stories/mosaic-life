import { NavLink } from 'react-router-dom';
import { NAV_ITEMS } from '@/lib/navigation';

export default function NavLinks() {
  return (
    <nav className="flex items-center gap-1">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          end={item.path === '/'}
          className={({ isActive }) =>
            `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              isActive
                ? 'text-theme-primary bg-theme-accent-light'
                : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100'
            }`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
