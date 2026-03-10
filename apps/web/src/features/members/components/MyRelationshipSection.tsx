import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Heart, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  useMemberProfile,
  useUpdateMemberProfile,
} from '@/features/members/hooks/useMemberProfile';
import {
  RELATIONSHIP_TYPE_LABELS,
  type RelationshipType,
} from '@/features/members/api/memberProfile';

interface MyRelationshipSectionProps {
  legacyId: string;
  legacyName: string;
}

const RELATIONSHIP_OPTIONS = Object.entries(RELATIONSHIP_TYPE_LABELS) as [
  RelationshipType,
  string,
][];

export default function MyRelationshipSection({
  legacyId,
  legacyName,
}: MyRelationshipSectionProps) {
  const { data: profile, isLoading } = useMemberProfile(legacyId);
  const updateProfile = useUpdateMemberProfile(legacyId);

  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [relationshipType, setRelationshipType] = useState<
    RelationshipType | ''
  >('');
  const [nickname, setNickname] = useState('');
  const [legacyToViewer, setLegacyToViewer] = useState('');
  const [viewerToLegacy, setViewerToLegacy] = useState('');
  const [traits, setTraits] = useState<string[]>([]);
  const [traitInput, setTraitInput] = useState('');
  const [hasInitialized, setHasInitialized] = useState(false);

  const hasProfile =
    profile &&
    (profile.relationship_type ||
      profile.nickname ||
      profile.legacy_to_viewer ||
      profile.viewer_to_legacy ||
      (profile.character_traits && profile.character_traits.length > 0));

  // Initialize form from profile data
  useEffect(() => {
    if (profile && !hasInitialized) {
      setRelationshipType(profile.relationship_type || '');
      setNickname(profile.nickname || '');
      setLegacyToViewer(profile.legacy_to_viewer || '');
      setViewerToLegacy(profile.viewer_to_legacy || '');
      setTraits(profile.character_traits || []);
      setHasInitialized(true);
    }
  }, [profile, hasInitialized]);

  // Auto-expand and start editing if no profile exists
  useEffect(() => {
    if (!isLoading && !hasProfile) {
      setIsExpanded(true);
      setIsEditing(true);
    }
  }, [isLoading, hasProfile]);

  const resetForm = () => {
    setRelationshipType(profile?.relationship_type || '');
    setNickname(profile?.nickname || '');
    setLegacyToViewer(profile?.legacy_to_viewer || '');
    setViewerToLegacy(profile?.viewer_to_legacy || '');
    setTraits(profile?.character_traits || []);
    setTraitInput('');
  };

  const handleSave = async () => {
    await updateProfile.mutateAsync({
      ...(relationshipType
        ? { relationship_type: relationshipType as RelationshipType }
        : {}),
      ...(nickname ? { nickname } : {}),
      ...(legacyToViewer ? { legacy_to_viewer: legacyToViewer } : {}),
      ...(viewerToLegacy ? { viewer_to_legacy: viewerToLegacy } : {}),
      ...(traits.length > 0 ? { character_traits: traits } : {}),
    });
    setIsEditing(false);
    setHasInitialized(false); // re-init from server data
  };

  const handleCancel = () => {
    resetForm();
    setIsEditing(false);
    if (!hasProfile) {
      setIsExpanded(false);
    }
  };

  const addTrait = () => {
    const trimmed = traitInput.trim();
    if (trimmed && !traits.includes(trimmed)) {
      setTraits([...traits, trimmed]);
    }
    setTraitInput('');
  };

  const removeTrait = (trait: string) => {
    setTraits(traits.filter((t) => t !== trait));
  };

  const handleTraitKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTrait();
    }
  };

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-2 text-sm text-neutral-500">
          <Loader2 className="size-4 animate-spin" />
          Loading relationship profile...
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      {/* Header — always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-6 text-left hover:bg-neutral-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-full bg-theme-accent-light flex items-center justify-center">
            <Heart className="size-5 text-theme-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-neutral-900">My Relationship</h3>
            <p className="text-sm text-neutral-500">
              {hasProfile
                ? `${profile?.nickname || RELATIONSHIP_TYPE_LABELS[profile?.relationship_type as RelationshipType] || 'Relationship set'}`
                : `Describe your relationship with ${legacyName}`}
            </p>
          </div>
        </div>
        {isExpanded ? (
          <ChevronUp className="size-5 text-neutral-400" />
        ) : (
          <ChevronDown className="size-5 text-neutral-400" />
        )}
      </button>

      {/* Expandable content */}
      {isExpanded && (
        <div className="px-6 pb-6 border-t border-neutral-100 pt-4">
          {!isEditing && hasProfile ? (
            /* Read view */
            <div className="space-y-4">
              {profile?.relationship_type && (
                <div>
                  <span className="text-xs font-medium text-neutral-500 uppercase tracking-wider">
                    Relationship
                  </span>
                  <p className="text-neutral-900">
                    {RELATIONSHIP_TYPE_LABELS[profile.relationship_type]}
                  </p>
                </div>
              )}
              {profile?.nickname && (
                <div>
                  <span className="text-xs font-medium text-neutral-500 uppercase tracking-wider">
                    I call them
                  </span>
                  <p className="text-neutral-900">{profile.nickname}</p>
                </div>
              )}
              {profile?.legacy_to_viewer && (
                <div>
                  <span className="text-xs font-medium text-neutral-500 uppercase tracking-wider">
                    Who they are to me
                  </span>
                  <p className="text-neutral-700">{profile.legacy_to_viewer}</p>
                </div>
              )}
              {profile?.viewer_to_legacy && (
                <div>
                  <span className="text-xs font-medium text-neutral-500 uppercase tracking-wider">
                    Who I am to them
                  </span>
                  <p className="text-neutral-700">{profile.viewer_to_legacy}</p>
                </div>
              )}
              {profile?.character_traits &&
                profile.character_traits.length > 0 && (
                  <div>
                    <span className="text-xs font-medium text-neutral-500 uppercase tracking-wider">
                      Character traits
                    </span>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {profile.character_traits.map((trait) => (
                        <span
                          key={trait}
                          className="px-3 py-1 bg-theme-accent-light text-theme-primary text-sm rounded-full"
                        >
                          {trait}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(true)}
              >
                Edit
              </Button>
            </div>
          ) : (
            /* Edit form */
            <div className="space-y-5">
              {!hasProfile && (
                <p className="text-sm text-neutral-600 bg-theme-accent-light/50 p-3 rounded-lg">
                  Help personalize your experience — tell us about your
                  relationship with {legacyName}. This information is private
                  and only visible to you.
                </p>
              )}

              {/* Relationship type */}
              <div className="space-y-2">
                <Label htmlFor="relationshipType">Relationship</Label>
                <select
                  id="relationshipType"
                  value={relationshipType}
                  onChange={(e) =>
                    setRelationshipType(e.target.value as RelationshipType)
                  }
                  className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-theme-primary"
                >
                  <option value="">Select relationship...</option>
                  {RELATIONSHIP_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Nickname */}
              <div className="space-y-2">
                <Label htmlFor="nickname">
                  What do you call them?
                </Label>
                <Input
                  id="nickname"
                  placeholder='e.g. "Mom", "Papa", "Coach"'
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  maxLength={100}
                />
              </div>

              {/* Legacy to viewer */}
              <div className="space-y-2">
                <Label htmlFor="legacyToViewer">Who they are to you</Label>
                <Textarea
                  id="legacyToViewer"
                  placeholder="In your own words, describe who this person is to you..."
                  value={legacyToViewer}
                  onChange={(e) => setLegacyToViewer(e.target.value)}
                  rows={3}
                  maxLength={1000}
                />
                <p className="text-xs text-neutral-400">
                  {legacyToViewer.length}/1000
                </p>
              </div>

              {/* Viewer to legacy */}
              <div className="space-y-2">
                <Label htmlFor="viewerToLegacy">Who you are to them</Label>
                <Textarea
                  id="viewerToLegacy"
                  placeholder="How would they describe your role in their life?"
                  value={viewerToLegacy}
                  onChange={(e) => setViewerToLegacy(e.target.value)}
                  rows={3}
                  maxLength={1000}
                />
                <p className="text-xs text-neutral-400">
                  {viewerToLegacy.length}/1000
                </p>
              </div>

              {/* Character traits */}
              <div className="space-y-2">
                <Label htmlFor="traits">Character traits</Label>
                <div className="flex gap-2">
                  <Input
                    id="traits"
                    placeholder="Type a trait and press Enter..."
                    value={traitInput}
                    onChange={(e) => setTraitInput(e.target.value)}
                    onKeyDown={handleTraitKeyDown}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addTrait}
                    disabled={!traitInput.trim()}
                  >
                    Add
                  </Button>
                </div>
                {traits.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {traits.map((trait) => (
                      <span
                        key={trait}
                        className="inline-flex items-center gap-1 px-3 py-1 bg-theme-accent-light text-theme-primary text-sm rounded-full"
                      >
                        {trait}
                        <button
                          onClick={() => removeTrait(trait)}
                          className="hover:text-red-500 transition-colors"
                        >
                          <X className="size-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={handleCancel}
                  disabled={updateProfile.isPending}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={updateProfile.isPending}
                  className="bg-theme-primary hover:bg-theme-primary-dark"
                >
                  {updateProfile.isPending ? (
                    <>
                      <Loader2 className="size-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save'
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
