import { useNavigate, useLocation } from 'react-router-dom';
import { SECTIONS, getActiveSection } from '@/lib/navigation';
import { cn } from '@/components/ui/utils';

export default function SectionSwitcher() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const activeSection = getActiveSection(pathname);

  return (
    <div className="flex items-center bg-neutral-100 rounded-lg p-1 gap-0.5">
      {SECTIONS.map((section) => {
        const isActive = activeSection?.key === section.key;
        return (
          <button
            key={section.key}
            onClick={() => navigate(section.path)}
            className={cn(
              'px-4 py-1.5 rounded-md text-sm font-medium transition-all duration-200',
              isActive
                ? 'bg-white text-theme-primary shadow-sm'
                : 'text-neutral-600 hover:text-neutral-900',
            )}
          >
            {section.label}
          </button>
        );
      })}
    </div>
  );
}
