import { useState } from 'react';
import { Check, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/contexts/AuthContext';
import {
  useProfileSettings,
  useUpdateProfileSettings,
  useUpdateUsername,
} from '@/features/profile/hooks/useProfile';
import type { ProfileSettingsUpdate } from '@/features/profile/api/profile';

const VISIBILITY_OPTIONS = [
  { value: 'nobody', label: 'Nobody' },
  { value: 'connections', label: 'Connections' },
  { value: 'authenticated', label: 'All logged-in users' },
  { value: 'public', label: 'Public' },
];

const VISIBILITY_FIELDS = [
  { key: 'visibility_bio', label: 'Bio' },
  { key: 'visibility_legacies', label: 'Legacies' },
  { key: 'visibility_stories', label: 'Stories' },
  { key: 'visibility_media', label: 'Media' },
  { key: 'visibility_connections', label: 'Connections list' },
] as const;

function UsernameSection() {
  const { user } = useAuth();
  const updateUsername = useUpdateUsername();
  const [editing, setEditing] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [error, setError] = useState<string | null>(null);

  const validateUsername = (value: string): string | null => {
    if (value.length < 3) return 'Must be at least 3 characters';
    if (value.length > 30) return 'Must be at most 30 characters';
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(value) && value.length > 1)
      return 'Lowercase letters, numbers, and hyphens only. Cannot start or end with hyphen.';
    if (/[A-Z]/.test(value)) return 'Must be lowercase';
    return null;
  };

  const handleSave = async () => {
    const validationError = validateUsername(newUsername);
    if (validationError) {
      setError(validationError);
      return;
    }
    try {
      await updateUsername.mutateAsync(newUsername);
      setEditing(false);
      setError(null);
    } catch (err: unknown) {
      const apiErr = err as { data?: { detail?: string } };
      setError(apiErr.data?.detail || 'Failed to update username');
    }
  };

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">Username</Label>
      {editing ? (
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input
              value={newUsername}
              onChange={(e) => {
                setNewUsername(e.target.value.toLowerCase());
                setError(null);
              }}
              placeholder="your-username"
              className="max-w-xs"
            />
            <Button
              size="sm"
              onClick={handleSave}
              disabled={updateUsername.isPending}
            >
              {updateUsername.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
          {error && (
            <p className="text-sm text-destructive flex items-center gap-1">
              <AlertCircle className="size-3" />
              {error}
            </p>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <span className="text-sm text-neutral-700">
            @{(user as unknown as Record<string, string>)?.username || 'not set'}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setNewUsername(
                (user as unknown as Record<string, string>)?.username || ''
              );
              setEditing(true);
            }}
          >
            Change
          </Button>
        </div>
      )}
    </div>
  );
}

export default function ConnectionsSettings() {
  const { data: settings, isLoading } = useProfileSettings();
  const updateSettings = useUpdateProfileSettings();

  const handleVisibilityChange = (
    field: string,
    value: string
  ) => {
    const update: ProfileSettingsUpdate = { [field]: value };
    updateSettings.mutate(update);
  };

  const handleDiscoverabilityChange = (checked: boolean) => {
    updateSettings.mutate({ discoverable: checked });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-theme-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-neutral-900">
          Connections & Privacy
        </h2>
        <p className="text-sm text-neutral-500 mt-1">
          Control your username, discoverability, and what others can see on your
          profile.
        </p>
      </div>

      <UsernameSection />

      <Separator />

      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Label className="text-sm font-medium">Discoverable</Label>
          <p className="text-xs text-neutral-500">
            Allow other users to find you via search. Co-members of your
            legacies can always find you.
          </p>
        </div>
        <Switch
          checked={settings?.discoverable ?? false}
          onCheckedChange={handleDiscoverabilityChange}
          disabled={updateSettings.isPending}
        />
      </div>

      <Separator />

      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-medium text-neutral-900">
            Profile Visibility
          </h3>
          <p className="text-xs text-neutral-500 mt-1">
            Choose who can see each section of your profile.
          </p>
        </div>

        {VISIBILITY_FIELDS.map(({ key, label }) => (
          <div key={key} className="flex items-center justify-between gap-4">
            <Label className="text-sm text-neutral-700 min-w-[120px]">
              {label}
            </Label>
            <Select
              value={
                (settings?.[key as keyof typeof settings] as string) ?? 'nobody'
              }
              onValueChange={(value) => handleVisibilityChange(key, value)}
              disabled={updateSettings.isPending}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VISIBILITY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
    </div>
  );
}
