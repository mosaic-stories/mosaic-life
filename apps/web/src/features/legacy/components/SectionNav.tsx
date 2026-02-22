import { Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export type SectionId = 'stories' | 'media' | 'ai';

export interface SectionNavProps {
  activeSection: SectionId;
  onSectionChange: (section: SectionId) => void;
}

function DemoBadge() {
  return (
    <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-xs">
      Demo
    </Badge>
  );
}

export default function SectionNav({ activeSection, onSectionChange }: SectionNavProps) {
  const baseClass = 'py-4 border-b-2 transition-colors';
  const activeClass = 'border-theme-primary text-neutral-900';
  const inactiveClass = 'border-transparent text-neutral-500 hover:text-neutral-900';

  return (
    <nav className="bg-white/90 backdrop-blur-sm border-b sticky top-[73px] z-30">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex gap-8">
          <button
            onClick={() => onSectionChange('stories')}
            className={`${baseClass} ${activeSection === 'stories' ? activeClass : inactiveClass}`}
          >
            Stories
          </button>
          <button
            onClick={() => onSectionChange('media')}
            className={`${baseClass} ${activeSection === 'media' ? activeClass : inactiveClass}`}
          >
            Media Gallery
          </button>
          <button
            onClick={() => onSectionChange('ai')}
            className={`${baseClass} ${activeSection === 'ai' ? activeClass : inactiveClass} flex items-center gap-2`}
          >
            <Sparkles className="size-4" />
            AI Interactions
            <DemoBadge />
          </button>
        </div>
      </div>
    </nav>
  );
}
