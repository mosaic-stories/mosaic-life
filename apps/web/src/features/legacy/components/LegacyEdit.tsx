import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookHeart, Globe, Lock, Loader2, AlertCircle, ChevronDown, ChevronUp, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useLegacy, useUpdateLegacy } from '@/features/legacy/hooks/useLegacies';
import type { LegacyVisibility } from '@/features/legacy/api/legacies';
import { normalizeOptionalText } from '@/lib/form-utils';
import { SEOHead } from '@/components/seo';
import PageActionBar from '@/components/PageActionBar';
import TagInput from '@/components/ui/tag-input';
import RelationshipCombobox from '@/components/ui/relationship-combobox';
import {
  useMemberProfile,
  useUpdateMemberProfile,
} from '@/features/members/hooks/useMemberProfile';

interface LegacyEditProps {
  legacyId: string;
}

export default function LegacyEdit({ legacyId }: LegacyEditProps) {
  const navigate = useNavigate();
  const { data: legacy, isLoading: legacyLoading, error: legacyError } = useLegacy(legacyId);
  const updateLegacy = useUpdateLegacy();

  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [deathDate, setDeathDate] = useState('');
  const [biography, setBiography] = useState('');
  const [gender, setGender] = useState('');
  const [visibility, setVisibility] = useState<LegacyVisibility>('private');
  const [error, setError] = useState<string | null>(null);
  const [hasInitialized, setHasInitialized] = useState(false);

  // Relationship profile state
  const [relationshipExpanded, setRelationshipExpanded] = useState(false);
  const [relationshipType, setRelationshipType] = useState('');
  const [nicknames, setNicknames] = useState<string[]>([]);
  const [legacyToViewer, setLegacyToViewer] = useState('');
  const [viewerToLegacy, setViewerToLegacy] = useState('');
  const [traits, setTraits] = useState<string[]>([]);
  const [profileInitialized, setProfileInitialized] = useState(false);

  const memberProfileQuery = useMemberProfile(legacyId);
  const updateMemberProfile = useUpdateMemberProfile(legacyId);

  // Initialize form with legacy data when it loads
  useEffect(() => {
    if (legacy && !hasInitialized) {
      setName(legacy.name || '');
      setBirthDate(legacy.birth_date || '');
      setDeathDate(legacy.death_date || '');
      setBiography(legacy.biography || '');
      setGender(legacy.gender || '');
      setVisibility(legacy.visibility || 'private');
      setHasInitialized(true);
    }
  }, [legacy, hasInitialized]);

  // Initialize relationship profile when it loads
  useEffect(() => {
    const profile = memberProfileQuery.data;
    if (profile && !profileInitialized) {
      setRelationshipType(profile.relationship_type || '');
      setNicknames(profile.nicknames || []);
      setLegacyToViewer(profile.legacy_to_viewer || '');
      setViewerToLegacy(profile.viewer_to_legacy || '');
      setTraits(profile.character_traits || []);
      setProfileInitialized(true);
      // Auto-expand if profile has data
      if (
        profile.relationship_type ||
        (profile.nicknames && profile.nicknames.length > 0) ||
        profile.legacy_to_viewer ||
        profile.viewer_to_legacy ||
        (profile.character_traits && profile.character_traits.length > 0)
      ) {
        setRelationshipExpanded(true);
      }
    }
  }, [memberProfileQuery.data, profileInitialized]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('section') === 'relationship') {
      setRelationshipExpanded(true);
    }
  }, []);

  const isCreator = legacy?.current_user_role === 'creator';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (isCreator && !name.trim()) {
      setError('Please enter a name for the legacy');
      return;
    }

    try {
      const promises: Promise<unknown>[] = [];

      // Only update legacy details if user is the creator
      if (isCreator) {
        promises.push(
          updateLegacy.mutateAsync({
            id: legacyId,
            data: {
              name: name.trim(),
              birth_date: birthDate || null,
              death_date: deathDate || null,
              biography: normalizeOptionalText(biography),
              gender: normalizeOptionalText(gender),
              visibility,
            },
          })
        );
      }

      // Build profile update — only include fields that have values
      const profileData: Record<string, unknown> = {};
      profileData.relationship_type = relationshipType || null;
      profileData.nicknames = nicknames.length > 0 ? nicknames : null;
      profileData.legacy_to_viewer = normalizeOptionalText(legacyToViewer);
      profileData.viewer_to_legacy = normalizeOptionalText(viewerToLegacy);
      profileData.character_traits = traits;

      promises.push(updateMemberProfile.mutateAsync(profileData));

      await Promise.all(promises);

      navigate(`/legacy/${legacyId}`);
    } catch (err) {
      setError('Failed to save changes. Please try again.');
      console.error('Error saving:', err);
    }
  };

  if (legacyLoading) {
    return (
      <div className="min-h-screen bg-theme-background flex items-center justify-center">
        <Loader2 className="size-8 animate-spin text-theme-primary" />
      </div>
    );
  }

  if (legacyError || !legacy) {
    return (
      <div className="min-h-screen bg-theme-background flex items-center justify-center p-6">
        <Card className="p-8 max-w-md text-center space-y-4">
          <div className="size-16 rounded-full bg-red-100 flex items-center justify-center mx-auto">
            <AlertCircle className="size-8 text-red-500" />
          </div>
          <div className="space-y-2">
            <h2 className="text-neutral-900">Unable to Load Legacy</h2>
            <p className="text-sm text-neutral-600">
              We couldn't find this legacy or you don't have permission to edit it.
            </p>
          </div>
          <div className="flex gap-3 justify-center pt-2">
            <Button variant="outline" onClick={() => navigate(-1)}>
              Go Back
            </Button>
            <Button onClick={() => navigate('/legacies')}>
              All Legacies
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-theme-background transition-colors duration-300">
      <SEOHead
        title="Edit Legacy"
        description="Edit your legacy information"
        noIndex={true}
      />
      <PageActionBar backLabel={legacy.name} backTo={`/legacy/${legacyId}`} />

      <main className="max-w-2xl mx-auto px-6 py-12">
        <div className="space-y-8">
          <div className="text-center space-y-2">
            <div className="size-16 rounded-full bg-theme-accent-light flex items-center justify-center mx-auto">
              <BookHeart className="size-8 text-theme-primary" />
            </div>
            <h1 className="text-neutral-900">{isCreator ? 'Edit Legacy' : 'My Relationship'}</h1>
            <p className="text-neutral-600">
              {isCreator
                ? 'Update the details for this legacy.'
                : `Describe your relationship with ${legacy?.name ?? 'this person'}.`}
            </p>
          </div>

          <Card className="p-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
                  {error}
                </div>
              )}

              {isCreator && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="name">Name *</Label>
                    <Input
                      id="name"
                      placeholder="Enter the person's name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                    <p className="text-xs text-neutral-500">
                      This is the name that will appear on the legacy page.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="birthDate">Birth Date</Label>
                      <div className="relative">
                        <Input
                          id="birthDate"
                          type="date"
                          value={birthDate}
                          onChange={(e) => setBirthDate(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="deathDate">Death Date (if applicable)</Label>
                      <Input
                        id="deathDate"
                        type="date"
                        value={deathDate}
                        onChange={(e) => setDeathDate(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="biography">Biography</Label>
                    <Textarea
                      id="biography"
                      placeholder="Share a brief biography or description..."
                      value={biography}
                      onChange={(e) => setBiography(e.target.value)}
                      rows={4}
                    />
                    <p className="text-xs text-neutral-500">
                      A short description that introduces this person to visitors.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="gender">Gender</Label>
                    <select
                      id="gender"
                      value={gender}
                      onChange={(e) => setGender(e.target.value)}
                      className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-theme-primary"
                    >
                      <option value="">Not specified</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="non_binary">Non-binary</option>
                      <option value="prefer_not_to_say">Prefer not to say</option>
                    </select>
                    <p className="text-xs text-neutral-500">
                      Used to personalize AI conversations about this person.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <Label>Visibility</Label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setVisibility('private')}
                        className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-all ${
                          visibility === 'private'
                            ? 'border-theme-primary bg-theme-accent-light'
                            : 'border-neutral-200 hover:border-neutral-300'
                        }`}
                      >
                        <Lock className={`size-5 ${visibility === 'private' ? 'text-theme-primary' : 'text-neutral-500'}`} />
                        <div className="text-left">
                          <div className={`font-medium ${visibility === 'private' ? 'text-theme-primary' : 'text-neutral-900'}`}>
                            Private
                          </div>
                          <div className="text-xs text-neutral-500">
                            Only invited members can view
                          </div>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setVisibility('public')}
                        className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-all ${
                          visibility === 'public'
                            ? 'border-theme-primary bg-theme-accent-light'
                            : 'border-neutral-200 hover:border-neutral-300'
                        }`}
                      >
                        <Globe className={`size-5 ${visibility === 'public' ? 'text-theme-primary' : 'text-neutral-500'}`} />
                        <div className="text-left">
                          <div className={`font-medium ${visibility === 'public' ? 'text-theme-primary' : 'text-neutral-900'}`}>
                            Public
                          </div>
                          <div className="text-xs text-neutral-500">
                            Anyone can discover and view
                          </div>
                        </div>
                      </button>
                    </div>
                    <p className="text-xs text-neutral-500">
                      Control who can see this legacy.
                    </p>
                  </div>
                </>
              )}

              {/* My Relationship section */}
              <div className="border border-neutral-200 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setRelationshipExpanded(!relationshipExpanded)}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-neutral-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Heart className="size-5 text-theme-primary" />
                    <div>
                      <span className="font-medium text-neutral-900">My Relationship</span>
                      <span className="text-sm text-neutral-500 ml-2">(optional)</span>
                    </div>
                  </div>
                  {relationshipExpanded ? (
                    <ChevronUp className="size-5 text-neutral-400" />
                  ) : (
                    <ChevronDown className="size-5 text-neutral-400" />
                  )}
                </button>

                {relationshipExpanded && (
                  <div className="px-4 pb-4 border-t border-neutral-100 pt-4 space-y-5">
                    <p className="text-sm text-neutral-500">
                      Describe your personal relationship with this person. This is private to you.
                    </p>

                    <div className="space-y-2">
                      <Label htmlFor="relationshipType">Relationship</Label>
                      <RelationshipCombobox
                        value={relationshipType}
                        onChange={setRelationshipType}
                        legacyGender={gender || legacy?.gender}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="nicknames">What do you call them?</Label>
                      <TagInput
                        id="nicknames"
                        values={nicknames}
                        onChange={setNicknames}
                        placeholder="Type a name and press Enter..."
                        maxItems={10}
                        maxLength={100}
                      />
                    </div>

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

                    <div className="space-y-2">
                      <Label htmlFor="characterTraits">Character traits</Label>
                      <TagInput
                        id="characterTraits"
                        values={traits}
                        onChange={setTraits}
                        placeholder="Type a trait and press Enter..."
                        maxItems={20}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-4 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate(`/legacy/${legacyId}`)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={updateLegacy.isPending || updateMemberProfile.isPending}
                  className="flex-1 bg-theme-primary hover:bg-theme-primary-dark"
                >
                  {(updateLegacy.isPending || updateMemberProfile.isPending) ? (
                    <>
                      <Loader2 className="size-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      </main>
    </div>
  );
}
