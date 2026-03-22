import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookHeart, Globe, Lock, Loader2, Users, Check, ChevronDown, ChevronUp, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useCreateLegacy } from '@/features/legacy/hooks/useLegacies';
import { usePersonMatch } from '@/features/person/hooks/usePersonMatch';
import type { PersonMatchCandidate } from '@/features/person/api/persons';
import type { LegacyVisibility } from '@/features/legacy/api/legacies';
import { SEOHead } from '@/components/seo';
import PageActionBar from '@/components/PageActionBar';
import TagInput from '@/components/ui/tag-input';
import RelationshipCombobox from '@/components/ui/relationship-combobox';
import { updateMemberProfile } from '@/features/members/api/memberProfile';
import { normalizeOptionalText } from '@/lib/form-utils';
import ImagePicker from '@/features/media/components/ImagePicker';
import {
  addMediaLegacyAssociation,
  setProfileImage,
  setBackgroundImage,
} from '@/features/media/api/media';

export default function LegacyCreation() {
  const navigate = useNavigate();
  const createLegacy = useCreateLegacy();

  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [deathDate, setDeathDate] = useState('');
  const [biography, setBiography] = useState('');
  const [visibility, setVisibility] = useState<LegacyVisibility>('private');
  const [error, setError] = useState<string | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<PersonMatchCandidate | null>(null);
  const [gender, setGender] = useState('');

  // Relationship profile state
  const [relationshipExpanded, setRelationshipExpanded] = useState(false);
  const [relationshipType, setRelationshipType] = useState('');
  const [nicknames, setNicknames] = useState<string[]>([]);
  const [legacyToViewer, setLegacyToViewer] = useState('');
  const [viewerToLegacy, setViewerToLegacy] = useState('');
  const [traits, setTraits] = useState<string[]>([]);
  const [profileImageId, setProfileImageId] = useState<string | null>(null);
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);
  const [backgroundImageId, setBackgroundImageId] = useState<string | null>(null);
  const [backgroundImageUrl, setBackgroundImageUrl] = useState<string | null>(null);

  const matchQuery = usePersonMatch(name, birthDate || null, deathDate || null);
  const candidates = matchQuery.data?.candidates ?? [];

  const handleSelectPerson = (candidate: PersonMatchCandidate) => {
    if (selectedPerson?.person_id === candidate.person_id) {
      setSelectedPerson(null);
    } else {
      setSelectedPerson(candidate);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Please enter a name for the legacy');
      return;
    }

    try {
      const legacy = await createLegacy.mutateAsync({
        name: name.trim(),
        birth_date: birthDate || null,
        death_date: deathDate || null,
        biography: biography.trim() || null,
        gender: normalizeOptionalText(gender),
        visibility,
        person_id: selectedPerson?.person_id ?? null,
      });

      const selectedImageIds = [...new Set(
        [profileImageId, backgroundImageId].filter(
          (mediaId): mediaId is string => mediaId !== null
        )
      )];
      for (const mediaId of selectedImageIds) {
        await addMediaLegacyAssociation(mediaId, legacy.id);
      }

      if (profileImageId) {
        await setProfileImage(legacy.id, profileImageId);
      }
      if (backgroundImageId) {
        await setBackgroundImage(legacy.id, backgroundImageId);
      }

      // Save relationship profile if any fields were filled
      const hasRelationshipData =
        relationshipType ||
        nicknames.length > 0 ||
        legacyToViewer.trim() ||
        viewerToLegacy.trim() ||
        traits.length > 0;

      if (hasRelationshipData) {
        try {
          await updateMemberProfile(legacy.id, {
            relationship_type: relationshipType || null,
            nicknames: nicknames.length > 0 ? nicknames : null,
            legacy_to_viewer: normalizeOptionalText(legacyToViewer),
            viewer_to_legacy: normalizeOptionalText(viewerToLegacy),
            character_traits: traits,
          });
        } catch (profileError) {
          console.error('Relationship profile save failed after legacy creation:', profileError);
          navigate(`/legacy/${legacy.id}/edit?section=relationship&notice=profile-save-failed`);
          return;
        }
      }

      navigate(`/legacy/${legacy.id}`);
    } catch (err) {
      setError('Failed to create legacy. Please try again.');
      console.error('Error creating legacy:', err);
    }
  };

  return (
    <div className="min-h-screen bg-theme-background transition-colors duration-300">
      <SEOHead
        title="Create Legacy"
        description="Create a new digital tribute to preserve stories and memories"
        noIndex={true}
      />
      <PageActionBar backLabel="Legacies" onBack={() => navigate(-1)} />

      <main className="max-w-2xl mx-auto px-6 py-12">
        <div className="space-y-8">
          <div className="text-center space-y-2">
            <div className="size-16 rounded-full bg-theme-accent-light flex items-center justify-center mx-auto">
              <BookHeart className="size-8 text-theme-primary" />
            </div>
            <h1 className="text-neutral-900">Create a Legacy</h1>
            <p className="text-neutral-600">
              Honor someone special by creating a digital tribute to preserve their stories and memories.
            </p>
          </div>

          <Card className="p-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  placeholder="Enter the person's name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setSelectedPerson(null);
                  }}
                  required
                />
                <p className="text-xs text-neutral-500">
                  This is the name that will appear on the legacy page.
                </p>
              </div>

              {candidates.length > 0 && !selectedPerson && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-amber-800 text-sm font-medium">
                    <Users className="size-4" />
                    <span>Existing people with a similar name</span>
                  </div>
                  <p className="text-xs text-amber-700">
                    Select a match to link this legacy to an existing person, or continue to create a new one.
                  </p>
                  <div className="space-y-2">
                    {candidates.map((candidate) => (
                      <button
                        key={candidate.person_id}
                        type="button"
                        onClick={() => handleSelectPerson(candidate)}
                        className="w-full flex items-center justify-between p-3 rounded-md border border-amber-200 bg-white hover:border-theme-primary hover:bg-theme-accent-light transition-colors text-left"
                      >
                        <div>
                          <div className="text-sm font-medium text-neutral-900">
                            {candidate.canonical_name}
                          </div>
                          <div className="text-xs text-neutral-500 flex items-center gap-2">
                            {candidate.birth_year_range && (
                              <span>Born {candidate.birth_year_range}</span>
                            )}
                            {candidate.death_year_range && (
                              <span>Died {candidate.death_year_range}</span>
                            )}
                            {candidate.legacy_count > 0 && (
                              <span>
                                {candidate.legacy_count} {candidate.legacy_count === 1 ? 'legacy' : 'legacies'}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-xs text-neutral-400">
                          {Math.round(candidate.confidence * 100)}% match
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {selectedPerson && (
                <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-green-800 text-sm font-medium">
                      <Check className="size-4" />
                      <span>Linked to {selectedPerson.canonical_name}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedPerson(null)}
                      className="text-xs text-green-700 hover:text-green-900 underline"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )}

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
                  You can change this setting later.
                </p>
              </div>

              {/* Images */}
              <div className="grid grid-cols-2 gap-4">
                <ImagePicker
                  label="Profile Image"
                  currentImageUrl={profileImageUrl}
                  currentImageId={profileImageId}
                  onImageSelected={(mediaId, url) => {
                    setProfileImageId(mediaId);
                    setProfileImageUrl(url);
                  }}
                  onImageRemoved={() => {
                    setProfileImageId(null);
                    setProfileImageUrl(null);
                  }}
                />
                <ImagePicker
                  label="Background Image"
                  currentImageUrl={backgroundImageUrl}
                  currentImageId={backgroundImageId}
                  onImageSelected={(mediaId, url) => {
                    setBackgroundImageId(mediaId);
                    setBackgroundImageUrl(url);
                  }}
                  onImageRemoved={() => {
                    setBackgroundImageId(null);
                    setBackgroundImageUrl(null);
                  }}
                />
              </div>

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
                        legacyGender={gender || null}
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
                  onClick={() => navigate(-1)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createLegacy.isPending}
                  className="flex-1 bg-theme-primary hover:bg-theme-primary-dark"
                >
                  {createLegacy.isPending ? (
                    <>
                      <Loader2 className="size-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create Legacy'
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
