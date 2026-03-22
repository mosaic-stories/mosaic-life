import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { SECTIONS, getActiveSection } from '@/lib/navigation';
import { cn } from '@/components/ui/utils';
import MobileNavSheet from './MobileNavSheet';

export default function BottomTabBar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const activeSection = getActiveSection(pathname);
  const [sheetSection, setSheetSection] = useState<string | null>(null);

  const openSection = SECTIONS.find((s) => s.key === sheetSection);

  const handleTabPress = (section: (typeof SECTIONS)[number]) => {
    if (section.items) {
      if (sheetSection === section.key) {
        setSheetSection(null);
      } else {
        setSheetSection(section.key);
      }
    } else {
      setSheetSection(null);
      navigate(section.path);
    }
  };

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-neutral-200 md:hidden pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-around py-2">
          {SECTIONS.map((section) => {
            const Icon = section.icon;
            const isActive = activeSection?.key === section.key;
            return (
              <button
                key={section.key}
                onClick={() => handleTabPress(section)}
                className={cn(
                  'flex flex-col items-center gap-0.5 px-2 py-1 text-xs transition-colors',
                  isActive
                    ? 'text-theme-primary'
                    : 'text-neutral-500 hover:text-neutral-700',
                )}
              >
                <Icon className="size-5" />
                <span>{section.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {openSection?.items && (
        <MobileNavSheet
          open={!!sheetSection}
          onOpenChange={(open) => !open && setSheetSection(null)}
          title={openSection.label}
          items={openSection.items}
        />
      )}
    </>
  );
}
