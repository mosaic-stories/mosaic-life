import { Globe, Lock, MessageSquare, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import type { Legacy } from '@/features/legacy/api/legacies';
import { getRelationshipDisplayLabel } from '@/features/members/api/memberProfile';
import type { MemberProfile } from '@/features/members/api/memberProfile';
import { rewriteBackendUrlForDev } from '@/lib/url';

export interface ProfileHeaderProps {
  legacy: Legacy;
  dates: string;
  storyCount: number;
  memberCount: number;
  onMembersClick: () => void;
  memberProfile?: MemberProfile | null;
  isMember?: boolean;
  legacyId: string;
}

function RelationshipSummary({
  profile,
  legacyGender,
  legacyName,
  legacyId,
}: {
  profile: MemberProfile | null;
  legacyGender: string | null;
  legacyName: string;
  legacyId: string;
}) {
  const navigate = useNavigate();

  const hasProfile =
    profile &&
    (profile.relationship_type ||
      (profile.nicknames && profile.nicknames.length > 0) ||
      (profile.character_traits && profile.character_traits.length > 0));

  if (!hasProfile) {
    return (
      <button
        onClick={() => navigate(`/legacy/${legacyId}/edit?section=relationship`)}
        className="text-sm text-theme-primary hover:text-theme-primary-dark transition-colors"
      >
        Describe your relationship with {legacyName} &rarr;
      </button>
    );
  }

  const MAX_NICKNAMES = 3;
  const MAX_TRAITS = 5;

  const segments: React.ReactNode[] = [];

  // Relationship label
  if (profile.relationship_type) {
    segments.push(
      <span key="rel" className="font-medium text-neutral-900">
        {getRelationshipDisplayLabel(profile.relationship_type, legacyGender)}
      </span>
    );
  }

  // Nicknames
  if (profile.nicknames && profile.nicknames.length > 0) {
    const visible = profile.nicknames.slice(0, MAX_NICKNAMES);
    const extra = profile.nicknames.length - MAX_NICKNAMES;
    segments.push(
      <span key="nick" className="text-neutral-600">
        {visible.map((n) => `\u201c${n}\u201d`).join(', ')}
        {extra > 0 && (
          <span className="text-neutral-400"> +{extra} more</span>
        )}
      </span>
    );
  }

  // Character traits
  if (profile.character_traits && profile.character_traits.length > 0) {
    const visible = profile.character_traits.slice(0, MAX_TRAITS);
    const extra = profile.character_traits.length - MAX_TRAITS;
    segments.push(
      <span key="traits" className="inline-flex items-center gap-1.5 flex-wrap">
        {visible.map((trait) => (
          <span
            key={trait}
            className="px-2 py-0.5 bg-theme-accent-light text-theme-primary text-xs rounded-full"
          >
            {trait}
          </span>
        ))}
        {extra > 0 && (
          <span className="text-xs text-neutral-400">+{extra} more</span>
        )}
      </span>
    );
  }

  return (
    <button
      onClick={() => navigate(`/legacy/${legacyId}/edit?section=relationship`)}
      className="flex items-center gap-2 flex-wrap text-sm hover:opacity-80 transition-opacity"
    >
      {segments.map((segment, i) => (
        <span key={i} className="flex items-center gap-2">
          {i > 0 && <span className="text-neutral-300">&middot;</span>}
          {segment}
        </span>
      ))}
    </button>
  );
}

export default function ProfileHeader({
  legacy,
  dates,
  storyCount,
  memberCount,
  onMembersClick,
  memberProfile,
  isMember,
  legacyId,
}: ProfileHeaderProps) {
  const navigate = useNavigate();
  return (
    <section className="bg-white border-b">
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="flex items-start gap-8">
          <div className="size-32 rounded-2xl overflow-hidden bg-neutral-100 flex-shrink-0">
            {legacy.profile_image_url ? (
              <img
                src={rewriteBackendUrlForDev(legacy.profile_image_url)}
                alt={legacy.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Users className="size-12 text-neutral-400" />
              </div>
            )}
          </div>
          <div className="flex-1 space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <h1 className="text-neutral-900">{legacy.name}</h1>
                <Badge variant="outline" className={legacy.visibility === 'public'
                  ? "bg-green-50 text-green-700 border-green-200"
                  : "bg-theme-accent-light text-theme-primary-dark border-theme-accent"
                }>
                  {legacy.visibility === 'public' ? (
                    <><Globe className="size-3 mr-1" /> Public</>
                  ) : (
                    <><Lock className="size-3 mr-1" /> Private</>
                  )}
                </Badge>
              </div>
              {dates && <p className="text-neutral-600">{dates}</p>}
              {legacy.biography && <p className="text-neutral-700 max-w-2xl">{legacy.biography}</p>}
            </div>

            {/* Relationship summary */}
            {isMember && (
              <RelationshipSummary
                profile={memberProfile ?? null}
                legacyGender={legacy.gender ?? null}
                legacyName={legacy.name}
                legacyId={legacyId}
              />
            )}

            <div className="flex items-center gap-6 text-sm">
              <div className="flex items-center gap-2 text-neutral-600">
                <MessageSquare className="size-4" />
                <span>{storyCount} {storyCount === 1 ? 'story' : 'stories'}</span>
              </div>
              <button
                onClick={onMembersClick}
                className="flex items-center gap-2 text-neutral-600 hover:text-theme-primary transition-colors"
              >
                <Users className="size-4" />
                <span>{memberCount} {memberCount === 1 ? 'member' : 'members'}</span>
              </button>
              {legacy.creator_name && (
                <div className="text-neutral-500">
                  Created by {legacy.creator_name}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
