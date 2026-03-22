import { Link } from 'react-router-dom';
import { Globe, Lock, Users, ChevronRight, Share2, MoreVertical, Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Legacy } from '@/features/legacy/api/legacies';
import { rewriteBackendUrlForDev } from '@/lib/url';

export interface ProfileHeaderProps {
  legacy: Legacy;
  dates: string;
  legacyId: string;
  isAuthenticated: boolean;
  canAddStory?: boolean;
  canRequestAccess?: boolean;
  canManageLegacy?: boolean;
  onAddStory: () => void;
  onRequestAccess?: () => void;
  isCreatingStory: boolean;
  onShare: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export default function ProfileHeader({
  legacy,
  dates,
  legacyId: _legacyId,
  isAuthenticated,
  canAddStory = true,
  canRequestAccess = false,
  canManageLegacy = false,
  onAddStory,
  onRequestAccess,
  isCreatingStory,
  onShare,
  onEdit,
  onDelete,
}: ProfileHeaderProps) {
  const profileImageUrl = legacy.profile_image_url
    ? rewriteBackendUrlForDev(legacy.profile_image_url)
    : null;
  const backgroundImageUrl = legacy.background_image_url
    ? rewriteBackendUrlForDev(legacy.background_image_url)
    : null;

  return (
    <section className="relative h-[280px] sm:h-[280px] overflow-hidden bg-gradient-to-br from-theme-primary-dark via-theme-primary to-theme-primary/70">
      {/* Cover image background */}
      {backgroundImageUrl ? (
        <img
          src={backgroundImageUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-30"
        />
      ) : profileImageUrl ? (
        <img
          src={profileImageUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-15 blur-sm"
        />
      ) : null}

      {/* Dark overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-theme-primary-dark/30 to-theme-primary-dark/85" />

      {/* Breadcrumb */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 pt-5">
        <nav className="flex items-center gap-2 text-[13px] text-white/60">
          <Link to="/" className="hover:text-white/80 transition-colors">Home</Link>
          <ChevronRight size={12} />
          <Link to="/legacies" className="hover:text-white/80 transition-colors">Legacies</Link>
          <ChevronRight size={12} />
          <span className="text-white/90 font-medium">{legacy.name}</span>
        </nav>
      </div>

      {/* Hero content — anchored to bottom */}
      <div className="absolute bottom-0 left-0 right-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-6 flex items-end gap-5 sm:gap-6">
          {/* Profile photo */}
          <div className="size-[90px] sm:size-[110px] rounded-2xl border-[3px] sm:border-4 border-white/90 overflow-hidden shrink-0 shadow-lg">
            {profileImageUrl ? (
              <img
                src={profileImageUrl}
                alt={legacy.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-theme-primary-dark/50 flex items-center justify-center">
                <Users className="size-10 text-white/60" />
              </div>
            )}
          </div>

          {/* Name & details */}
          <div className="flex-1 pb-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <h1 className="font-serif text-2xl sm:text-3xl font-semibold text-white tracking-tight truncate">
                {legacy.name}
              </h1>
              <Badge className="bg-white/20 backdrop-blur-sm text-white border-white/30 text-[11px] font-semibold shrink-0">
                {legacy.visibility === 'public' ? (
                  <><Globe size={11} className="mr-1" /> Public</>
                ) : (
                  <><Lock size={11} className="mr-1" /> Private</>
                )}
              </Badge>
            </div>
            {dates && (
              <p className="text-white/60 text-sm sm:text-[15px]">{dates}</p>
            )}
            {legacy.biography && (
              <p className="text-white/85 text-sm sm:text-base italic font-serif mt-1 line-clamp-1">
                &ldquo;{legacy.biography}&rdquo;
              </p>
            )}
          </div>

          {/* Action buttons */}
          {isAuthenticated && (
            <div className="flex gap-2 shrink-0">
              {canRequestAccess ? (
                <Button
                  size="sm"
                  className="bg-white text-theme-primary-dark hover:bg-white/90 shadow-md"
                  onClick={onRequestAccess}
                >
                  <span>Request Access</span>
                </Button>
              ) : canAddStory ? (
                <Button
                  size="sm"
                  className="bg-white text-theme-primary-dark hover:bg-white/90 shadow-md"
                  onClick={onAddStory}
                  disabled={isCreatingStory}
                >
                  {isCreatingStory ? (
                    <Loader2 className="size-4 mr-1.5 animate-spin" />
                  ) : (
                    <Plus className="size-4 mr-1.5" />
                  )}
                  <span className="hidden sm:inline">Add Story</span>
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                className="bg-white/15 backdrop-blur-sm text-white border border-white/20 hover:bg-white/25 hover:text-white"
                onClick={onShare}
              >
                <Share2 size={16} />
              </Button>
              {canManageLegacy && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="bg-white/15 backdrop-blur-sm text-white border border-white/20 hover:bg-white/25 hover:text-white"
                    >
                      <MoreVertical size={16} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={onEdit}>
                      <Pencil className="size-4" /> Edit Legacy
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onClick={onDelete}>
                      <Trash2 className="size-4" /> Delete Legacy
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
