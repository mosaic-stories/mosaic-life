import { Upload, Grid, Clock } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface MediaGalleryHeaderProps {
  photoCount: number;
  contributorCount: number;
  onUploadClick: () => void;
}

export default function MediaGalleryHeader({
  photoCount,
  contributorCount,
  onUploadClick,
}: MediaGalleryHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h2 className="font-serif text-xl sm:text-[22px] font-semibold text-neutral-900">
          Media Gallery
        </h2>
        <p className="text-[13px] text-neutral-400 mt-0.5">
          {photoCount} {photoCount === 1 ? 'photo' : 'photos'} · Uploaded by{' '}
          {contributorCount} {contributorCount === 1 ? 'contributor' : 'contributors'}
        </p>
      </div>
      <div className="flex items-center gap-2.5">
        {/* View toggle */}
        <div className="flex bg-white border border-stone-200 rounded-lg overflow-hidden">
          <button type="button" className="px-2.5 py-1.5 bg-stone-100">
            <Grid size={15} className="text-stone-700" />
          </button>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-disabled="true"
                  aria-label="Timeline view unavailable"
                  className="px-2.5 py-1.5 cursor-not-allowed"
                >
                  <Clock size={15} className="text-neutral-300" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Add dates to photos to unlock timeline view</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        {/* Upload button */}
        <button
          type="button"
          onClick={onUploadClick}
          className="flex items-center gap-1.5 px-4 py-2 bg-stone-700 text-white rounded-lg text-[13px] font-semibold hover:bg-stone-800 transition-colors"
        >
          <Upload size={14} />
          Upload
        </button>
      </div>
    </div>
  );
}
