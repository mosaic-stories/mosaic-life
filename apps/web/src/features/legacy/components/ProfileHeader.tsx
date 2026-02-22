import { Globe, Lock, MessageSquare, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { Legacy } from '@/features/legacy/api/legacies';
import { rewriteBackendUrlForDev } from '@/lib/url';

export interface ProfileHeaderProps {
  legacy: Legacy;
  dates: string;
  storyCount: number;
  memberCount: number;
  onMembersClick: () => void;
}

export default function ProfileHeader({
  legacy,
  dates,
  storyCount,
  memberCount,
  onMembersClick,
}: ProfileHeaderProps) {
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
                  : "bg-[rgb(var(--theme-accent-light))] text-[rgb(var(--theme-primary-dark))] border-[rgb(var(--theme-accent))]"
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

            <div className="flex items-center gap-6 text-sm">
              <div className="flex items-center gap-2 text-neutral-600">
                <MessageSquare className="size-4" />
                <span>{storyCount} {storyCount === 1 ? 'story' : 'stories'}</span>
              </div>
              <button
                onClick={onMembersClick}
                className="flex items-center gap-2 text-neutral-600 hover:text-[rgb(var(--theme-primary))] transition-colors"
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
