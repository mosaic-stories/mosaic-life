import { getPersonaIconComponent } from '@/features/ai-chat/utils/personaIcons';
import { useFavoritePersonas } from '@/features/connections/hooks/useConnections';

interface FavoritePersonasChipsProps {
  onPersonaClick?: (personaId: string) => void;
}

export default function FavoritePersonasChips({ onPersonaClick }: FavoritePersonasChipsProps) {
  const { data, isLoading } = useFavoritePersonas(4);

  if (isLoading) return null;
  if (!data || data.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-neutral-500">Favorite Personas</h3>
      <div className="flex gap-4 overflow-x-auto pb-1">
        {data.map((item) => {
          const Icon = getPersonaIconComponent(item.persona_icon);
          return (
            <button
              key={item.persona_id}
              onClick={() => onPersonaClick?.(item.persona_id)}
              className="flex flex-col items-center gap-1.5 min-w-0 group"
            >
              <div className="relative">
                <div className="size-12 rounded-full bg-neutral-100 flex items-center justify-center ring-2 ring-transparent group-hover:ring-theme-primary transition-all">
                  <Icon className="size-5 text-neutral-500" />
                </div>
                <span className="absolute -top-1 -right-1 size-5 rounded-full bg-theme-primary text-white text-xs flex items-center justify-center font-medium">
                  {item.conversation_count}
                </span>
              </div>
              <span className="text-xs text-neutral-600 truncate max-w-[72px]">
                {item.persona_name.replace('The ', '')}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
