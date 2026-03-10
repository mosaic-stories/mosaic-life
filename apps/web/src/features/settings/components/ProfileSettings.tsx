/**
 * Profile settings section.
 */

import { useState, useEffect } from 'react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useProfile, useUpdateProfile } from '@/features/settings/hooks/useSettings';
import { normalizeOptionalText } from '@/lib/form-utils';

export default function ProfileSettings() {
  const { data: profile, isLoading } = useProfile();
  const updateProfile = useUpdateProfile();

  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [gender, setGender] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);

  // Initialize form when profile loads
  useEffect(() => {
    if (profile && !hasInitialized) {
      setName(profile.name);
      setBio(profile.bio || '');
      setGender(profile.gender || '');
      setHasInitialized(true);
    }
  }, [profile, hasInitialized]);

  const handleNameChange = (value: string) => {
    setName(value);
    setHasChanges(value !== profile?.name || bio !== (profile?.bio || '') || gender !== (profile?.gender || ''));
  };

  const handleBioChange = (value: string) => {
    setBio(value);
    setHasChanges(name !== profile?.name || value !== (profile?.bio || '') || gender !== (profile?.gender || ''));
  };

  const handleGenderChange = (value: string) => {
    setGender(value);
    setHasChanges(name !== profile?.name || bio !== (profile?.bio || '') || value !== (profile?.gender || ''));
  };

  const handleSave = () => {
    updateProfile.mutate(
      { name, bio: normalizeOptionalText(bio), gender: normalizeOptionalText(gender) },
      {
        onSuccess: () => {
          setHasChanges(false);
        },
      }
    );
  };

  const handleCancel = () => {
    if (profile) {
      setName(profile.name);
      setBio(profile.bio || '');
      setGender(profile.gender || '');
      setHasChanges(false);
    }
  };

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 rounded w-1/4"></div>
        <div className="h-24 bg-gray-200 rounded"></div>
      </div>
    );
  }

  const initials = profile?.name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Profile</h2>
        <p className="text-sm text-gray-500">Manage your personal information</p>
      </div>

      {/* Avatar */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <Label className="text-sm font-medium text-gray-700">Avatar</Label>
        <div className="mt-2 flex items-center gap-4">
          <Avatar className="size-16">
            <AvatarImage src={profile?.avatar_url || undefined} />
            <AvatarFallback className="bg-theme-primary/10 text-theme-primary text-lg">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="text-sm text-gray-500">
            Avatar is managed by your Google account
          </div>
        </div>
      </div>

      {/* Name */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <Label htmlFor="name" className="text-sm font-medium text-gray-700">
          Display Name
        </Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          className="mt-2 max-w-md"
          maxLength={100}
        />
      </div>

      {/* Email */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <Label className="text-sm font-medium text-gray-700">Email</Label>
        <div className="mt-2 flex items-center gap-2">
          <Input
            value={profile?.email || ''}
            disabled
            className="max-w-md bg-gray-50"
          />
          <span className="text-xs text-green-600 font-medium">Verified</span>
        </div>
        <p className="mt-1 text-sm text-gray-500">
          Managed by Google - Connected via OAuth
        </p>
      </div>

      {/* Bio */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <Label htmlFor="bio" className="text-sm font-medium text-gray-700">
          Bio (optional)
        </Label>
        <Textarea
          id="bio"
          value={bio}
          onChange={(e) => handleBioChange(e.target.value)}
          placeholder="Tell others a bit about yourself..."
          className="mt-2 max-w-lg"
          maxLength={500}
          rows={4}
        />
        <p className="mt-1 text-sm text-gray-400">{bio.length}/500 characters</p>
      </div>

      {/* Gender */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <Label htmlFor="gender" className="text-sm font-medium text-gray-700">
          Gender (optional)
        </Label>
        <select
          id="gender"
          value={gender}
          onChange={(e) => handleGenderChange(e.target.value)}
          className="mt-2 w-full max-w-md rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-theme-primary"
        >
          <option value="">Not specified</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
          <option value="non_binary">Non-binary</option>
          <option value="prefer_not_to_say">Prefer not to say</option>
        </select>
        <p className="mt-1 text-sm text-gray-500">
          Used to personalize AI conversations.
        </p>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button
          variant="outline"
          onClick={handleCancel}
          disabled={!hasChanges || updateProfile.isPending}
        >
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          disabled={!hasChanges || updateProfile.isPending}
        >
          {updateProfile.isPending ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
}
