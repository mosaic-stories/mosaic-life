import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, User, BookHeart } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { SEOHead } from '@/components/seo';
import { rewriteBackendUrlForDev } from '@/lib/url';
import { useUserProfile } from '../hooks/useProfile';
import ConnectButton from '@/features/user-connections/components/ConnectButton';
import type { ProfileResponse } from '../api/profile';

function ProfileHeader({ profile }: { profile: ProfileResponse }) {
  const initials = profile.display_name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase();

  return (
    <div className="flex flex-col items-center text-center space-y-4">
      <Avatar className="size-24">
        <AvatarImage src={profile.avatar_url || undefined} />
        <AvatarFallback className="bg-theme-primary text-white text-2xl">
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-neutral-900">
          {profile.display_name}
        </h1>
        <p className="text-sm text-neutral-500">@{profile.username}</p>
      </div>
      {profile.visibility_context.show_bio && profile.bio && (
        <p className="text-neutral-600 max-w-md">{profile.bio}</p>
      )}
    </div>
  );
}

function LegaciesSection({
  legacies,
}: {
  legacies: ProfileResponse['legacies'];
}) {
  const navigate = useNavigate();
  if (!legacies || legacies.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-neutral-900">Legacies</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {legacies.map((legacy) => (
          <Card
            key={legacy.id}
            className="p-4 cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => navigate(`/legacy/${legacy.id}`)}
          >
            <div className="flex items-center gap-3">
              {legacy.subject_photo_url ? (
                <img
                  src={rewriteBackendUrlForDev(legacy.subject_photo_url)}
                  alt={legacy.name}
                  className="size-12 rounded-full object-cover"
                />
              ) : (
                <div className="size-12 rounded-full bg-neutral-100 flex items-center justify-center">
                  <BookHeart className="size-5 text-neutral-400" />
                </div>
              )}
              <div className="min-w-0">
                <p className="font-medium text-neutral-900 truncate">
                  {legacy.name}
                </p>
                <p className="text-xs text-neutral-500">
                  {legacy.story_count} {legacy.story_count === 1 ? 'story' : 'stories'}
                </p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function StoriesSection({
  stories,
}: {
  stories: ProfileResponse['stories'];
}) {
  if (!stories || stories.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-neutral-900">Stories</h2>
      <div className="space-y-3">
        {stories.map((story) => (
          <Card key={story.id} className="p-4 space-y-2">
            <div className="space-y-1">
              <p className="font-medium text-neutral-900">{story.title}</p>
              {story.legacy_name && (
                <p className="text-xs text-neutral-500">{story.legacy_name}</p>
              )}
            </div>
            {story.preview && (
              <p className="text-sm text-neutral-600 line-clamp-3">{story.preview}</p>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

function ConnectionsSection({
  connections,
}: {
  connections: ProfileResponse['connections'];
}) {
  const navigate = useNavigate();
  if (!connections || connections.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-neutral-900">Connections</h2>
      <div className="flex flex-wrap gap-3">
        {connections.map((conn) => {
          const initials = conn.display_name
            .split(' ')
            .map((n) => n[0])
            .join('')
            .toUpperCase();
          return (
            <button
              key={conn.username}
              onClick={() => navigate(`/u/${conn.username}`)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border hover:bg-neutral-50 transition-colors"
            >
              <Avatar className="size-8">
                <AvatarImage src={conn.avatar_url || undefined} />
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium text-neutral-900">
                {conn.display_name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const { data: profile, isLoading, error } = useUserProfile(username || '');

  if (isLoading) {
    return (
      <div className="min-h-screen bg-theme-background flex items-center justify-center">
        <Loader2 className="size-8 animate-spin text-theme-primary" />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-theme-background flex items-center justify-center p-6">
        <Card className="p-8 max-w-md text-center space-y-4">
          <div className="size-16 rounded-full bg-neutral-100 flex items-center justify-center mx-auto">
            <User className="size-8 text-neutral-400" />
          </div>
          <h2 className="text-neutral-900">User Not Found</h2>
          <p className="text-sm text-neutral-600">
            This user doesn't exist or their profile is not available.
          </p>
          <Button variant="outline" onClick={() => navigate('/')}>
            Go Home
          </Button>
        </Card>
      </div>
    );
  }

  const ctx = profile.visibility_context;
  const hasContent =
    ctx.show_bio ||
    ctx.show_legacies ||
    ctx.show_stories ||
    ctx.show_connections;

  return (
    <div className="min-h-screen bg-theme-background">
      <SEOHead
        title={`${profile.display_name} (@${profile.username})`}
        description={profile.bio ?? `Profile of ${profile.display_name}`}
        path={`/u/${profile.username}`}
        ogImage={profile.avatar_url ?? undefined}
        ogType="profile"
        noIndex={!hasContent}
      />

      <div className="max-w-3xl mx-auto px-6 py-12 space-y-8">
        <ProfileHeader profile={profile} />

        <div className="flex justify-center">
          <ConnectButton
            targetUserId={profile.user_id}
            targetUserName={profile.display_name}
          />
        </div>

        {ctx.show_legacies && (
          <LegaciesSection legacies={profile.legacies} />
        )}

        {ctx.show_stories && (
          <StoriesSection stories={profile.stories} />
        )}

        {ctx.show_connections && (
          <ConnectionsSection connections={profile.connections} />
        )}

        {!hasContent && (
          <p className="text-center text-sm text-neutral-500">
            This user hasn't made their profile content public yet.
          </p>
        )}
      </div>
    </div>
  );
}
