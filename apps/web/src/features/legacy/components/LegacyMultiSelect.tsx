import { useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useLegacies } from '@/features/legacy/hooks/useLegacies';
import type { LegacyAssociationInput } from '@/features/story/api/stories';

interface LegacyMultiSelectProps {
  value: LegacyAssociationInput[];
  onChange: (value: LegacyAssociationInput[]) => void;
  requirePrimary?: boolean;
  disabled?: boolean;
}

function normalizeAssociations(
  associations: LegacyAssociationInput[],
  requirePrimary: boolean,
): LegacyAssociationInput[] {
  const normalized = associations.map((association, index) => ({
    legacy_id: association.legacy_id,
    role: association.role ?? 'secondary',
    position: index,
  }));

  if (requirePrimary && normalized.length > 0 && !normalized.some((item) => item.role === 'primary')) {
    normalized[0].role = 'primary';
  }

  return normalized;
}

export default function LegacyMultiSelect({
  value,
  onChange,
  requirePrimary = true,
  disabled = false,
}: LegacyMultiSelectProps) {
  const { data: legacies, isLoading } = useLegacies();

  const selectedMap = useMemo(() => {
    const map = new Map<string, LegacyAssociationInput>();
    value.forEach((association) => {
      map.set(association.legacy_id, association);
    });
    return map;
  }, [value]);

  const updateAssociations = (nextAssociations: LegacyAssociationInput[]) => {
    onChange(normalizeAssociations(nextAssociations, requirePrimary));
  };

  const toggleLegacy = (legacyId: string) => {
    const isSelected = selectedMap.has(legacyId);
    if (isSelected) {
      const remaining = value.filter((association) => association.legacy_id !== legacyId);
      updateAssociations(remaining);
      return;
    }

    const nextRole = value.length === 0 ? 'primary' : 'secondary';
    updateAssociations([
      ...value,
      {
        legacy_id: legacyId,
        role: nextRole,
      },
    ]);
  };

  const setPrimary = (legacyId: string) => {
    const next = value.map((association) => ({
      ...association,
      role: association.legacy_id === legacyId ? ('primary' as const) : ('secondary' as const),
    }));
    updateAssociations(next);
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-neutral-500">
        <Loader2 className="size-4 animate-spin" />
        <span>Loading legacies...</span>
      </div>
    );
  }

  if (!legacies || legacies.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        No legacies available yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {legacies.map((legacy) => {
        const association = selectedMap.get(legacy.id);
        const isSelected = !!association;

        return (
          <div
            key={legacy.id}
            className="rounded-lg border border-neutral-200 p-3"
          >
            <div className="flex items-center justify-between gap-3">
              <label className="flex items-center gap-3 text-sm text-neutral-800">
                <Checkbox
                  checked={isSelected}
                  disabled={disabled}
                  onCheckedChange={() => toggleLegacy(legacy.id)}
                />
                <span>{legacy.name}</span>
              </label>

              {isSelected && (
                <div className="flex items-center gap-2">
                  {association.role === 'primary' ? (
                    <Badge variant="default">Primary</Badge>
                  ) : (
                    <Badge variant="secondary">Secondary</Badge>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={disabled || association.role === 'primary'}
                    onClick={() => setPrimary(legacy.id)}
                  >
                    Set primary
                  </Button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}