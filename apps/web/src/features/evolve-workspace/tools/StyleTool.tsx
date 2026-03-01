import { Eye, Heart, MessageCircle, AlignLeft, FileText } from 'lucide-react';
import { cn } from '@/components/ui/utils';
import { useEvolveWorkspaceStore } from '../store/useEvolveWorkspaceStore';
import type { WritingStyle, LengthPreference } from '@/lib/api/evolution';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

const WRITING_STYLES: {
  id: WritingStyle;
  name: string;
  description: string;
  icon: typeof Eye;
}[] = [
  { id: 'vivid', name: 'Vivid', description: 'Sensory details, atmosphere', icon: Eye },
  { id: 'emotional', name: 'Emotional', description: 'Feelings, relationships', icon: Heart },
  {
    id: 'conversational',
    name: 'Conversational',
    description: 'Informal, personal',
    icon: MessageCircle,
  },
  { id: 'concise', name: 'Concise', description: 'Tight, impactful', icon: AlignLeft },
  { id: 'documentary', name: 'Documentary', description: 'Factual, chronological', icon: FileText },
];

const LENGTH_OPTIONS: { id: LengthPreference; label: string }[] = [
  { id: 'similar', label: 'Keep similar length' },
  { id: 'shorter', label: 'Make it shorter' },
  { id: 'longer', label: 'Allow it to grow' },
];

export function StyleTool() {
  const writingStyle = useEvolveWorkspaceStore((s) => s.writingStyle);
  const lengthPreference = useEvolveWorkspaceStore((s) => s.lengthPreference);
  const setWritingStyle = useEvolveWorkspaceStore((s) => s.setWritingStyle);
  const setLengthPreference = useEvolveWorkspaceStore((s) => s.setLengthPreference);

  return (
    <div className="p-3 space-y-5">
      {/* Writing style */}
      <section>
        <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">
          Writing Style
        </h3>
        <div className="space-y-1.5">
          {WRITING_STYLES.map(({ id, name, description, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setWritingStyle(id)}
              className={cn(
                'flex items-center gap-3 w-full p-2.5 rounded-md border text-left text-sm transition-colors',
                writingStyle === id
                  ? 'border-theme-primary bg-theme-primary/5'
                  : 'border-neutral-200 hover:border-neutral-300',
              )}
            >
              <Icon className="h-4 w-4 shrink-0 text-neutral-500" />
              <div className="min-w-0">
                <p className="font-medium">{name}</p>
                <p className="text-xs text-neutral-500">{description}</p>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Length preference */}
      <section>
        <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">
          Length Preference
        </h3>
        <RadioGroup
          value={lengthPreference ?? undefined}
          onValueChange={(v) => setLengthPreference(v as LengthPreference)}
        >
          {LENGTH_OPTIONS.map(({ id, label }) => (
            <div key={id} className="flex items-center space-x-2">
              <RadioGroupItem value={id} id={`length-${id}`} />
              <Label htmlFor={`length-${id}`} className="text-sm">
                {label}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </section>

      {/* Info */}
      <p className="text-xs text-neutral-400">
        These preferences are applied when you click "AI Rewrite" in the bottom toolbar.
      </p>
    </div>
  );
}
