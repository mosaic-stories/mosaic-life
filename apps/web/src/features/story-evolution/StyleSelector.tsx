import { useState } from 'react';
import { Eye, Heart, MessageCircle, AlignLeft, FileText, Loader2 } from 'lucide-react';
import { cn } from '@/components/ui/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import type { WritingStyle, LengthPreference } from '@/lib/api/evolution';

const WRITING_STYLES = [
  { id: 'vivid', name: 'Vivid', description: 'Sensory details, setting, atmosphere, descriptive language', icon: Eye },
  { id: 'emotional', name: 'Emotional', description: 'Emotional arc, feelings, relationships, internal experience', icon: Heart },
  { id: 'conversational', name: 'Conversational', description: 'Informal tone, personal, direct, matching natural voice', icon: MessageCircle },
  { id: 'concise', name: 'Concise', description: 'Distilled, tight, impact per word, suitable for reading aloud', icon: AlignLeft },
  { id: 'documentary', name: 'Documentary', description: 'Factual, chronological, biographical, third-person', icon: FileText },
] as const;

const LENGTH_OPTIONS = [
  { id: 'similar', label: 'Keep similar length' },
  { id: 'shorter', label: 'Make it shorter' },
  { id: 'longer', label: 'Allow it to grow' },
] as const;

interface StyleSelectorProps {
  onSubmit: (style: WritingStyle, length: LengthPreference) => void;
  isSubmitting?: boolean;
  defaultStyle?: WritingStyle;
  defaultLength?: LengthPreference;
}

export function StyleSelector({
  onSubmit,
  isSubmitting = false,
  defaultStyle,
  defaultLength,
}: StyleSelectorProps) {
  const [selectedStyle, setSelectedStyle] = useState<WritingStyle | undefined>(defaultStyle);
  const [selectedLength, setSelectedLength] = useState<LengthPreference | undefined>(defaultLength);

  const canSubmit = selectedStyle !== undefined && selectedLength !== undefined && !isSubmitting;

  function handleSubmit() {
    if (selectedStyle !== undefined && selectedLength !== undefined) {
      onSubmit(selectedStyle, selectedLength);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Writing Style Section */}
      <section>
        <h2 className="mb-3 text-base font-semibold text-foreground">
          Choose a writing style
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {WRITING_STYLES.map(({ id, name, description, icon: Icon }) => {
            const isSelected = selectedStyle === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setSelectedStyle(id as WritingStyle)}
                aria-pressed={isSelected}
                className="text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--theme-primary))] focus-visible:ring-offset-2 rounded-xl"
              >
                <Card
                  className={cn(
                    'cursor-pointer transition-colors duration-150 h-full',
                    isSelected
                      ? 'border-2 border-[rgb(var(--theme-primary))] bg-[rgb(var(--theme-primary))]/5'
                      : 'border hover:bg-accent/50'
                  )}
                >
                  <CardContent className="flex flex-col gap-2 p-4">
                    <Icon
                      className={cn(
                        'size-5 shrink-0',
                        isSelected
                          ? 'text-[rgb(var(--theme-primary))]'
                          : 'text-muted-foreground'
                      )}
                    />
                    <span
                      className={cn(
                        'text-sm font-medium leading-tight',
                        isSelected
                          ? 'text-[rgb(var(--theme-primary))]'
                          : 'text-foreground'
                      )}
                    >
                      {name}
                    </span>
                    <span className="text-xs text-muted-foreground leading-snug">
                      {description}
                    </span>
                  </CardContent>
                </Card>
              </button>
            );
          })}
        </div>
      </section>

      {/* Length Preference Section */}
      <section>
        <h2 className="mb-3 text-base font-semibold text-foreground">
          Length preference
        </h2>
        <RadioGroup
          value={selectedLength ?? ''}
          onValueChange={(value) => setSelectedLength(value as LengthPreference)}
          className="flex flex-col gap-2"
        >
          {LENGTH_OPTIONS.map(({ id, label }) => (
            <div key={id} className="flex items-center gap-3">
              <RadioGroupItem value={id} id={`length-${id}`} />
              <Label
                htmlFor={`length-${id}`}
                className="cursor-pointer text-sm font-normal text-foreground"
              >
                {label}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </section>

      {/* Submit Button */}
      <div className="flex justify-start sm:justify-end">
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={cn(
            'w-full sm:w-auto',
            'bg-[rgb(var(--theme-primary))] text-white hover:bg-[rgb(var(--theme-primary))]/90'
          )}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Generating...
            </>
          ) : (
            'Generate Draft'
          )}
        </Button>
      </div>
    </div>
  );
}
