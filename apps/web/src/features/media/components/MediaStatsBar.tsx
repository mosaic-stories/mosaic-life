import { useMemo } from 'react';
import { LayoutGrid, Image, Video, Music, FileText } from 'lucide-react';
import { type MediaItem } from '@/features/media/api/media';

interface MediaStatsBarProps {
  media: MediaItem[];
}

interface StatConfig {
  label: string;
  icon: typeof LayoutGrid;
  count: number;
}

export default function MediaStatsBar({ media }: MediaStatsBarProps) {
  const stats = useMemo((): StatConfig[] => {
    let images = 0;
    let videos = 0;
    let audio = 0;
    let documents = 0;

    for (const item of media) {
      const ct = item.content_type;
      if (ct.startsWith('image/')) images++;
      else if (ct.startsWith('video/')) videos++;
      else if (ct.startsWith('audio/')) audio++;
      else documents++;
    }

    return [
      { label: 'Total', icon: LayoutGrid, count: media.length },
      { label: 'Images', icon: Image, count: images },
      { label: 'Videos', icon: Video, count: videos },
      { label: 'Audio', icon: Music, count: audio },
      { label: 'Documents', icon: FileText, count: documents },
    ];
  }, [media]);

  return (
    <div className="flex flex-wrap gap-3 mb-6">
      {stats.map((stat) => {
        const Icon = stat.icon;
        const isZero = stat.count === 0;

        return (
          <div
            key={stat.label}
            className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border ${
              isZero
                ? 'border-stone-100 bg-stone-50/50 text-stone-300'
                : 'border-stone-200 bg-white text-stone-700 shadow-sm'
            }`}
          >
            <Icon size={16} className={isZero ? 'text-stone-300' : 'text-stone-500'} />
            <span className={`text-lg font-semibold tabular-nums ${isZero ? 'text-stone-300' : 'text-stone-800'}`}>
              {stat.count}
            </span>
            <span className={`text-xs font-medium ${isZero ? 'text-stone-300' : 'text-stone-500'}`}>
              {stat.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
