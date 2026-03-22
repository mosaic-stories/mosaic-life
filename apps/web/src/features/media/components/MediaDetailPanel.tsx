import { useState, useEffect, useRef } from 'react';
import {
  X, ChevronLeft, ChevronRight, Download, Star, Sparkles,
  Info, Users, Tag, BookOpen, Calendar, MapPin, Clock, FileText,
  HardDrive, Plus, Search, Trash2,
} from 'lucide-react';
import { type MediaItem } from '@/features/media/api/media';
import { getMediaContentUrl } from '@/features/media/api/media';
import { rewriteBackendUrlForDev } from '@/lib/url';
import FavoriteButton from '@/features/favorites/components/FavoriteButton';
import { useFavoriteCheck } from '@/features/favorites/hooks/useFavorites';
import UserLink from '@/components/UserLink';
import {
  useSetProfileImage,
  useSetBackgroundImage,
  useUpdateMedia,
  useTagPerson,
  useUntagPerson,
  useAddTag,
  useRemoveTag,
  useLegacyTags,
  useSearchPersons,
} from '@/features/media/hooks/useMedia';
import DetailSection from './DetailSection';
import MetadataRow from './MetadataRow';
import TagPill from './TagPill';

const NON_TEXT_INPUT_TYPES = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

function getKeyboardContextTarget(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof HTMLElement)) {
    return null;
  }

  return target.closest('input, textarea, select, button, [contenteditable="true"], [role="textbox"]');
}

function shouldBlockArrowNavigation(target: EventTarget | null): boolean {
  return getKeyboardContextTarget(target) !== null;
}

function shouldKeepEscapeLocal(target: EventTarget | null): boolean {
  const contextTarget = getKeyboardContextTarget(target);

  if (!contextTarget) {
    return false;
  }

  if (contextTarget instanceof HTMLTextAreaElement) {
    return true;
  }

  if (contextTarget instanceof HTMLInputElement) {
    return !NON_TEXT_INPUT_TYPES.has(contextTarget.type);
  }

  if (contextTarget.getAttribute('role') === 'textbox') {
    return true;
  }

  return contextTarget.isContentEditable || contextTarget.getAttribute('contenteditable') === 'true';
}

interface MediaDetailPanelProps {
  media: MediaItem;
  allMedia: MediaItem[];
  legacyId?: string;
  profileImageId?: string | null;
  backgroundImageId?: string | null;
  onClose: () => void;
  onNavigate: (mediaId: string) => void;
  isAuthenticated: boolean;
  onRequestDelete?: (mediaId: string) => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export default function MediaDetailPanel({
  media,
  allMedia,
  legacyId,
  profileImageId,
  backgroundImageId,
  onClose,
  onNavigate,
  isAuthenticated,
  onRequestDelete,
}: MediaDetailPanelProps) {
  const effectiveLegacyId = legacyId ?? media.legacies[0]?.legacy_id ?? '';
  const showLegacyActions = !!legacyId;

  const [tagInput, setTagInput] = useState('');
  const [personSearch, setPersonSearch] = useState('');
  const [showPersonSearch, setShowPersonSearch] = useState(false);
  const [editingCaption, setEditingCaption] = useState(false);
  const [captionValue, setCaptionValue] = useState(media.caption ?? '');
  const captionRef = useRef<HTMLTextAreaElement>(null);

  // Navigation helpers
  const currentIndex = allMedia.findIndex((m) => m.id === media.id);
  const prevMedia = currentIndex > 0 ? allMedia[currentIndex - 1] : null;
  const nextMedia = currentIndex < allMedia.length - 1 ? allMedia[currentIndex + 1] : null;

  // Keep caption in sync when the media prop changes
  useEffect(() => {
    setCaptionValue(media.caption ?? '');
    setEditingCaption(false);
    setShowPersonSearch(false);
    setPersonSearch('');
    setTagInput('');
  }, [media.id, media.caption]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && shouldBlockArrowNavigation(e.target)) {
        return;
      }

      if (e.key === 'Escape') {
        if (shouldKeepEscapeLocal(e.target)) {
          return;
        }

        onClose();
        return;
      }

      if (editingCaption) {
        return;
      }

      if (e.key === 'ArrowLeft' && prevMedia) {
        onNavigate(prevMedia.id);
      } else if (e.key === 'ArrowRight' && nextMedia) {
        onNavigate(nextMedia.id);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [prevMedia, nextMedia, onNavigate, onClose, editingCaption]);

  // Hooks
  const updateMedia = useUpdateMedia(effectiveLegacyId || undefined);
  const tagPerson = useTagPerson(effectiveLegacyId || undefined);
  const untagPerson = useUntagPerson(effectiveLegacyId || undefined);
  const addTag = useAddTag(effectiveLegacyId || undefined);
  const removeTag = useRemoveTag(effectiveLegacyId || undefined);
  const setProfileImage = useSetProfileImage(effectiveLegacyId);
  const setBackgroundImage = useSetBackgroundImage(effectiveLegacyId);
  const { data: legacyTags } = useLegacyTags(effectiveLegacyId || undefined);
  const { data: personSearchResults } = useSearchPersons(personSearch, effectiveLegacyId || undefined);
  const { data: favoriteData } = useFavoriteCheck('media', [media.id]);

  const isFavorited = favoriteData?.favorites[media.id] ?? false;
  const isProfileImage = media.id === profileImageId;
  const isBackgroundImage = media.id === backgroundImageId;
  const normalizedTagInput = tagInput.trim().toLowerCase();
  const filteredTagSuggestions = normalizedTagInput
    ? (legacyTags ?? [])
      .filter((tag) =>
        tag.name.toLowerCase().includes(normalizedTagInput)
        && !media.tags.some((mediaTag) => mediaTag.name.toLowerCase() === tag.name.toLowerCase())
      )
      .slice(0, 5)
    : [];
  const showCreatePerson =
    showPersonSearch
    && personSearch.trim().length >= 2
    && !!personSearchResults
    && personSearchResults.length === 0;

  const handleCaptionSave = () => {
    setEditingCaption(false);
    if (captionValue !== (media.caption ?? '')) {
      updateMedia.mutate({ mediaId: media.id, data: { caption: captionValue || null } });
    }
  };

  const handleCaptionKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      setCaptionValue(media.caption ?? '');
      setEditingCaption(false);
    }
  };

  useEffect(() => {
    if (editingCaption && captionRef.current) {
      captionRef.current.focus();
      const len = captionRef.current.value.length;
      captionRef.current.setSelectionRange(len, len);
    }
  }, [editingCaption]);

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      addTag.mutate(
        { mediaId: media.id, name: tagInput.trim(), legacyId: effectiveLegacyId },
        {
          onSuccess: () => setTagInput(''),
        }
      );
    }
  };

  const handleAddTag = (name: string) => {
    addTag.mutate(
      { mediaId: media.id, name, legacyId },
      {
        onSuccess: () => setTagInput(''),
      }
    );
  };

  const handleTagPerson = (personId: string) => {
    tagPerson.mutate(
      { mediaId: media.id, data: { person_id: personId, role: 'subject' } },
      {
        onSuccess: () => {
          setPersonSearch('');
          setShowPersonSearch(false);
        },
      }
    );
  };

  const handleCreatePerson = () => {
    const name = personSearch.trim();
    if (!name) return;

    tagPerson.mutate(
      { mediaId: media.id, data: { name, role: 'subject' } },
      {
        onSuccess: () => {
          setPersonSearch('');
          setShowPersonSearch(false);
        },
      }
    );
  };

  const handleSetProfile = () => {
    setProfileImage.mutate(media.id);
  };

  const handleSetBackground = () => {
    setBackgroundImage.mutate(media.id);
  };

  const downloadUrl = rewriteBackendUrlForDev(getMediaContentUrl(media.id));

  return (
    <div className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden">
      {/* Image Preview Area */}
      <div className="bg-neutral-900 rounded-t-xl relative aspect-video">
        <img
          src={rewriteBackendUrlForDev(getMediaContentUrl(media.id))}
          alt={media.caption ?? media.filename}
          className="w-full h-full object-contain"
        />

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 bg-black/40 hover:bg-black/60 text-white rounded-full p-1.5 transition-colors"
          aria-label="Close"
        >
          <X size={16} />
        </button>

        {/* Prev navigation */}
        {prevMedia && (
          <button
            onClick={() => onNavigate(prevMedia.id)}
            className="absolute left-3 top-1/2 -translate-y-1/2 z-10 bg-black/40 hover:bg-black/60 text-white rounded-full p-1.5 transition-colors"
            aria-label="Previous photo"
          >
            <ChevronLeft size={18} />
          </button>
        )}

        {/* Next navigation */}
        {nextMedia && (
          <button
            onClick={() => onNavigate(nextMedia.id)}
            className="absolute right-3 top-1/2 -translate-y-1/2 z-10 bg-black/40 hover:bg-black/60 text-white rounded-full p-1.5 transition-colors"
            aria-label="Next photo"
          >
            <ChevronRight size={18} />
          </button>
        )}

        {/* Action bar at bottom */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-3 py-3 flex items-center gap-2">
          {isAuthenticated && (
            <FavoriteButton
              entityType="media"
              entityId={media.id}
              isFavorited={isFavorited}
              favoriteCount={media.favorite_count ?? 0}
              size="sm"
            />
          )}

          <a
            href={downloadUrl}
            download={media.filename}
            className="inline-flex items-center gap-1.5 text-xs text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-md px-2.5 py-1.5 transition-colors"
            aria-label="Download"
          >
            <Download size={13} />
            Download
          </a>

          {showLegacyActions && isAuthenticated && (
            isProfileImage ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-amber-300 bg-amber-500/20 rounded-md px-2.5 py-1.5">
                <Star size={12} className="fill-amber-300" />
                Profile Photo
              </span>
            ) : (
              <button
                onClick={handleSetProfile}
                disabled={setProfileImage.isPending}
                className="inline-flex items-center gap-1.5 text-xs text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-md px-2.5 py-1.5 transition-colors disabled:opacity-50"
              >
                <Star size={13} />
                Set as Profile
              </button>
            )
          )}

          {showLegacyActions && isAuthenticated && (
            isBackgroundImage ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-300 bg-emerald-500/20 rounded-md px-2.5 py-1.5">
                <Star size={12} className="fill-emerald-300" />
                Background
              </span>
            ) : (
              <button
                onClick={handleSetBackground}
                disabled={setBackgroundImage.isPending}
                className="inline-flex items-center gap-1.5 text-xs text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-md px-2.5 py-1.5 transition-colors disabled:opacity-50"
              >
                <Star size={13} />
                Set as Background
              </button>
            )
          )}

          {isAuthenticated && onRequestDelete && (
            <button
              onClick={() => onRequestDelete(media.id)}
              className="inline-flex items-center gap-1.5 text-xs text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-md px-2.5 py-1.5 transition-colors"
              aria-label="Delete Photo"
            >
              <Trash2 size={13} />
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Content area */}
      <div className="p-5 space-y-1">
        {/* Caption Section */}
        <DetailSection icon={FileText} title="Caption">
          {editingCaption ? (
            <textarea
              ref={captionRef}
              value={captionValue}
              onChange={(e) => setCaptionValue(e.target.value)}
              onBlur={handleCaptionSave}
              onKeyDown={handleCaptionKeyDown}
              rows={3}
              placeholder="Add a caption..."
              className="w-full text-sm text-neutral-900 border border-stone-300 rounded-md px-2.5 py-2 outline-none focus:ring-1 focus:ring-stone-400 bg-stone-50 resize-none leading-relaxed"
            />
          ) : (
            <div
              onClick={() => isAuthenticated && setEditingCaption(true)}
              className={`text-sm leading-relaxed rounded-md px-1 -mx-1 ${
                media.caption
                  ? 'text-neutral-900'
                  : 'text-neutral-400 italic'
              } ${isAuthenticated ? 'cursor-pointer hover:bg-stone-50' : ''}`}
            >
              {media.caption || 'Add a caption...'}
            </div>
          )}
        </DetailSection>

        {/* AI Insights Section */}
        <DetailSection icon={Sparkles} title="AI Insights" defaultOpen={false}>
          <div className="bg-gradient-to-br from-violet-50 to-purple-50 rounded-lg p-4 text-center space-y-2">
            <div className="flex justify-center">
              <Sparkles size={20} className="text-violet-400" />
            </div>
            <p className="text-sm font-medium text-violet-700">Coming Soon</p>
            <p className="text-xs text-violet-500 leading-relaxed">
              AI-powered photo analysis and insights will appear here
            </p>
          </div>
        </DetailSection>

        {/* Details Section */}
        <DetailSection icon={Info} title="Details">
          <div className="space-y-0.5">
            <MetadataRow
              icon={Calendar}
              label="Date Taken"
              value={media.date_taken}
              editable={isAuthenticated}
              placeholder="Add date..."
              onSave={(val) =>
                updateMedia.mutate({ mediaId: media.id, data: { date_taken: val || null } })
              }
            />
            <MetadataRow
              icon={MapPin}
              label="Location"
              value={media.location}
              editable={isAuthenticated}
              placeholder="Add location..."
              onSave={(val) =>
                updateMedia.mutate({ mediaId: media.id, data: { location: val || null } })
              }
            />
            <MetadataRow
              icon={Clock}
              label="Era"
              value={media.era}
              editable={isAuthenticated}
              placeholder="Add era..."
              onSave={(val) =>
                updateMedia.mutate({ mediaId: media.id, data: { era: val || null } })
              }
            />
            <MetadataRow
              icon={FileText}
              label="Filename"
              value={media.filename}
            />
            <MetadataRow
              icon={HardDrive}
              label="Size"
              value={formatBytes(media.size_bytes)}
            />
            <MetadataRow
              icon={Users}
              label="Uploaded by"
              value={
                <UserLink
                  username={media.uploader_username}
                  displayName={media.uploader_name}
                />
              }
            />
          </div>
        </DetailSection>

        {/* People Section */}
        <DetailSection
          icon={Users}
          title="People"
          action={
            isAuthenticated ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowPersonSearch((prev) => !prev);
                }}
                className="text-[10px] text-neutral-400 hover:text-neutral-600 flex items-center gap-0.5 transition-colors"
              >
                <Plus size={10} />
                Tag
              </button>
            ) : undefined
          }
        >
          <div className="space-y-2">
            {media.people.length > 0 ? (
              <ul className="space-y-1.5">
                {media.people.map((person) => (
                  <li key={person.person_id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-neutral-800">{person.person_name}</span>
                      {person.role && (
                        <span className="text-[10px] font-medium text-stone-500 bg-stone-100 px-1.5 py-0.5 rounded-full">
                          {person.role}
                        </span>
                      )}
                    </div>
                    {isAuthenticated && (
                      <button
                        onClick={() =>
                          untagPerson.mutate({ mediaId: media.id, personId: person.person_id })
                        }
                        className="text-neutral-300 hover:text-red-400 transition-colors"
                        aria-label={`Remove ${person.person_name}`}
                      >
                        <X size={12} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-neutral-400 italic">No people tagged yet</p>
            )}

            {isAuthenticated && !showPersonSearch && (
              <button
                onClick={() => setShowPersonSearch(true)}
                className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-600 transition-colors mt-1"
              >
                <Plus size={12} />
                Tag someone
              </button>
            )}

            {showPersonSearch && (
              <div className="mt-2 space-y-1.5">
                <div className="relative">
                  <Search
                    size={13}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none"
                  />
                  <input
                    autoFocus
                    value={personSearch}
                    onChange={(e) => setPersonSearch(e.target.value)}
                    placeholder="Search by name..."
                    className="w-full text-sm border border-stone-300 rounded-md pl-7 pr-3 py-1.5 outline-none focus:ring-1 focus:ring-stone-400 bg-stone-50"
                  />
                </div>
                {personSearchResults && personSearchResults.length > 0 && (
                  <ul className="border border-stone-200 rounded-md overflow-hidden shadow-sm">
                    {personSearchResults.map((result) => (
                      <li key={result.id}>
                        <button
                          onClick={() => handleTagPerson(result.id)}
                          disabled={tagPerson.isPending}
                          className="w-full text-left text-sm px-3 py-2 hover:bg-stone-50 transition-colors text-neutral-800 disabled:opacity-50"
                        >
                          {result.canonical_name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {showCreatePerson && (
                  <div className="border border-dashed border-stone-300 rounded-md px-3 py-2.5 bg-stone-50 space-y-2">
                    <p className="text-xs text-neutral-500">
                      No matches found. Create a new person from this name?
                    </p>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-neutral-800 truncate">{personSearch.trim()}</span>
                      <button
                        onClick={handleCreatePerson}
                        disabled={tagPerson.isPending}
                        className="shrink-0 inline-flex items-center gap-1.5 text-xs text-neutral-700 hover:text-neutral-900 bg-white border border-stone-300 rounded-md px-2.5 py-1.5 transition-colors disabled:opacity-50"
                      >
                        <Plus size={12} />
                        Create person
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </DetailSection>

        {/* Tags Section */}
        <DetailSection icon={Tag} title="Tags">
          <div className="space-y-2">
            {media.tags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {media.tags.map((tag) => (
                  <TagPill
                    key={tag.id}
                    label={tag.name}
                    onRemove={
                      isAuthenticated
                        ? () => removeTag.mutate({ mediaId: media.id, tagId: tag.id })
                        : undefined
                    }
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-neutral-400 italic">No tags yet</p>
            )}

            {isAuthenticated && (
              <div className="mt-1.5 space-y-2">
                <div className="flex items-center gap-2">
                  <Plus size={13} className="text-neutral-400 shrink-0" />
                  <input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={handleTagKeyDown}
                    placeholder="Add a tag and press Enter..."
                    className="flex-1 text-sm border border-stone-300 rounded-md px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-stone-400 bg-stone-50"
                    disabled={addTag.isPending}
                  />
                </div>
                {filteredTagSuggestions.length > 0 && (
                  <ul className="border border-stone-200 rounded-md overflow-hidden shadow-sm">
                    {filteredTagSuggestions.map((tag) => (
                      <li key={tag.id}>
                        <button
                          onClick={() => handleAddTag(tag.name)}
                          disabled={addTag.isPending}
                          className="w-full text-left text-sm px-3 py-2 hover:bg-stone-50 transition-colors text-neutral-800 disabled:opacity-50"
                        >
                          {tag.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </DetailSection>

        {/* Linked Stories Section */}
        <DetailSection icon={BookOpen} title="Linked Stories" defaultOpen={false}>
          <div className="text-center py-4 space-y-1">
            <BookOpen size={24} className="mx-auto text-neutral-200" />
            <p className="text-sm font-medium text-neutral-400">No stories linked yet</p>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Stories mentioning this photo will appear here
            </p>
          </div>
        </DetailSection>
      </div>
    </div>
  );
}
