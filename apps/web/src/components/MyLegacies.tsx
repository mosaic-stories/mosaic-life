import { useMemo, useState } from 'react';
import { BookHeart, Plus, Loader2, AlertCircle, Users, Globe, Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { HeaderSlot } from '@/components/header';
import SearchBar from './SearchBar';
import { useLegacies } from '@/lib/hooks/useLegacies';
import { useStories, useUpdateStory } from '@/lib/hooks/useStories';
import type { StorySummary, LegacyAssociationInput } from '@/lib/api/stories';
import { formatLegacyDates, getLegacyContext, type Legacy } from '@/lib/api/legacies';
import { rewriteBackendUrlForDev } from '@/lib/url';
import { SEOHead } from '@/components/seo';
import LegacyMultiSelect from './LegacyMultiSelect';

interface MyLegaciesProps {
  onNavigate: (view: string) => void;
}

const contextLabels: Record<string, string> = {
  memorial: 'Memorial',
  'living-tribute': 'Living Tribute',
};

const contextColors: Record<string, string> = {
  memorial: 'bg-purple-100 text-purple-800',
  'living-tribute': 'bg-amber-100 text-amber-800',
};

function LegacyCard({ legacy, onClick }: { legacy: Legacy; onClick: () => void }) {
  const dates = formatLegacyDates(legacy);
  const context = getLegacyContext(legacy);
  const memberCount = legacy.members?.length || 0;

  return (
    <Card
      className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer"
      onClick={onClick}
    >
      <div className="h-40 bg-neutral-100 overflow-hidden">
        {legacy.profile_image_url ? (
          <img
            src={rewriteBackendUrlForDev(legacy.profile_image_url)}
            alt={legacy.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="h-full flex items-center justify-center text-neutral-300">
            <Users className="size-10" />
          </div>
        )}
      </div>
      <div className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-neutral-900 line-clamp-1">{legacy.name}</h3>
          <Badge className={`shrink-0 text-xs ${contextColors[context] || 'bg-neutral-100 text-neutral-800'}`}>
            {contextLabels[context] || context}
          </Badge>
        </div>
        {legacy.biography && (
          <p className="text-sm text-neutral-600 line-clamp-2">{legacy.biography}</p>
        )}
        {dates && (
          <p className="text-xs text-neutral-500">{dates}</p>
        )}
        <div className="flex items-center gap-4 text-xs text-neutral-500 pt-2 border-t">
          <div className="flex items-center gap-1">
            <Users className="size-3" />
            <span>{memberCount} {memberCount === 1 ? 'member' : 'members'}</span>
          </div>
          <div className="flex items-center gap-1">
            {legacy.visibility === 'public' ? (
              <><Globe className="size-3" /> Public</>
            ) : (
              <><Lock className="size-3" /> Private</>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function MyLegacies({ onNavigate }: MyLegaciesProps) {
  const navigate = useNavigate();
  const { data: legacies, isLoading, error } = useLegacies();
  const { data: orphanedStories, isLoading: orphanedLoading } = useStories(undefined, true);
  const updateStory = useUpdateStory();

  const [storyToAssign, setStoryToAssign] = useState<StorySummary | null>(null);
  const [assignmentLegacies, setAssignmentLegacies] = useState<LegacyAssociationInput[]>([]);

  const hasOrphanedStories = useMemo(
    () => !!orphanedStories && orphanedStories.length > 0,
    [orphanedStories],
  );

  const handleLegacyClick = (legacyId: string) => {
    navigate(`/legacy/${legacyId}`);
  };

  const handleCreateLegacy = () => {
    // For now, navigate to a create page (will need to be implemented)
    onNavigate('create-legacy');
  };

  const handleSearchSelect = (type: string, id: string) => {
    if (type === 'legacy') {
      navigate(`/legacy/${id}`);
    } else if (type === 'community') {
      navigate(`/community/${id}`);
    }
  };

  const openAssignmentDialog = (story: StorySummary) => {
    setStoryToAssign(story);
    setAssignmentLegacies([]);
  };

  const closeAssignmentDialog = () => {
    setStoryToAssign(null);
    setAssignmentLegacies([]);
  };

  const handleAssignStory = async () => {
    if (!storyToAssign || assignmentLegacies.length === 0) return;

    await updateStory.mutateAsync({
      storyId: storyToAssign.id,
      data: {
        legacies: assignmentLegacies.map((legacy, index) => ({
          legacy_id: legacy.legacy_id,
          role: legacy.role,
          position: index,
        })),
      },
    });

    closeAssignmentDialog();
  };

  return (
    <>
      <SEOHead
        title="My Legacies"
        description="Manage your legacies and preserved memories"
        noIndex={true}
      />
      <HeaderSlot>
        <SearchBar onSelectResult={handleSearchSelect} compact />
        <Button
          onClick={handleCreateLegacy}
          size="sm"
          className="gap-2 bg-[rgb(var(--theme-primary))] hover:bg-[rgb(var(--theme-primary-dark))]"
        >
          <Plus className="size-4" />
          <span className="hidden sm:inline">Create Legacy</span>
        </Button>
      </HeaderSlot>

      <main className="max-w-7xl mx-auto px-6 py-12">
        <div className="space-y-8">
          <div>
            <h1 className="text-neutral-900">My Legacies</h1>
            <p className="text-neutral-600 mt-2">
              Legacies you've created and curated
            </p>
          </div>

          <section className="space-y-3">
            <div>
              <h2 className="text-neutral-900">Needs Assignment</h2>
              <p className="text-sm text-neutral-600 mt-1">
                Stories without legacy links after legacy changes.
              </p>
            </div>

            {orphanedLoading && (
              <div className="flex items-center gap-2 text-sm text-neutral-500">
                <Loader2 className="size-4 animate-spin" />
                <span>Loading unassigned stories...</span>
              </div>
            )}

            {!orphanedLoading && !hasOrphanedStories && (
              <Card className="p-4 text-sm text-neutral-600">
                No stories need reassignment.
              </Card>
            )}

            {!orphanedLoading && hasOrphanedStories && (
              <div className="space-y-3">
                {orphanedStories?.map((story) => (
                  <Card key={story.id} className="p-4 flex items-center justify-between gap-4">
                    <div className="space-y-1">
                      <p className="text-neutral-900">{story.title}</p>
                      {story.content_preview && (
                        <p className="text-sm text-neutral-600 line-clamp-2">{story.content_preview}</p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      onClick={() => openAssignmentDialog(story)}
                    >
                      Assign Legacies
                    </Button>
                  </Card>
                ))}
              </div>
            )}
          </section>

          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-8 animate-spin text-[rgb(var(--theme-primary))]" />
            </div>
          )}

          {error && (
            <Card className="p-6 border-red-200 bg-red-50">
              <div className="flex items-center gap-3 text-red-800">
                <AlertCircle className="size-5" />
                <div>
                  <p className="font-medium">Failed to load legacies</p>
                  <p className="text-sm text-red-600">Please try again later.</p>
                </div>
              </div>
            </Card>
          )}

          {!isLoading && !error && (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Create new legacy card */}
              <Card
                className="p-8 border-dashed hover:border-[rgb(var(--theme-accent))] hover:bg-[rgb(var(--theme-accent-light))]/30 transition-colors cursor-pointer"
                onClick={handleCreateLegacy}
              >
                <div className="text-center space-y-3">
                  <div className="size-12 rounded-full bg-[rgb(var(--theme-accent-light))] flex items-center justify-center mx-auto">
                    <Plus className="size-6 text-[rgb(var(--theme-primary))]" />
                  </div>
                  <div>
                    <p className="text-neutral-900">Create a new legacy</p>
                    <p className="text-sm text-neutral-500">Start preserving memories</p>
                  </div>
                </div>
              </Card>

              {/* Existing legacies */}
              {legacies?.map((legacy) => (
                <LegacyCard
                  key={legacy.id}
                  legacy={legacy}
                  onClick={() => handleLegacyClick(legacy.id)}
                />
              ))}
            </div>
          )}

          {!isLoading && !error && legacies?.length === 0 && (
            <div className="text-center py-12">
              <BookHeart className="size-12 mx-auto text-neutral-300 mb-4" />
              <p className="text-neutral-600">You haven't created any legacies yet.</p>
              <p className="text-sm text-neutral-500 mt-1">Click "Create Legacy" to get started.</p>
            </div>
          )}
        </div>
      </main>

      <Dialog open={!!storyToAssign} onOpenChange={(open) => !open && closeAssignmentDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign story to legacies</DialogTitle>
            <DialogDescription>
              Choose one or more legacies for this story and set the primary legacy.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {storyToAssign && (
              <Card className="p-3">
                <p className="text-sm text-neutral-500">Story</p>
                <p className="text-neutral-900">{storyToAssign.title}</p>
              </Card>
            )}

            <LegacyMultiSelect
              value={assignmentLegacies}
              onChange={setAssignmentLegacies}
              requirePrimary={true}
              disabled={updateStory.isPending}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={closeAssignmentDialog}
              disabled={updateStory.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleAssignStory}
              disabled={updateStory.isPending || assignmentLegacies.length === 0}
            >
              {updateStory.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                'Save Assignments'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
