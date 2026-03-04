import { User, Landmark } from 'lucide-react';
import type { PersonConnection } from '@/features/connections/api/connections';

interface PersonCardProps {
  person: PersonConnection;
}

export default function PersonCard({ person }: PersonCardProps) {
  const displayLegacies = person.shared_legacies.slice(0, 3);
  const overflow = person.shared_legacies.length - displayLegacies.length;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 space-y-3 hover:shadow-sm transition-shadow">
      <div className="flex items-center gap-3">
        <div className="size-10 rounded-full overflow-hidden bg-neutral-100 flex-shrink-0">
          {person.avatar_url ? (
            <img
              src={person.avatar_url}
              alt={person.display_name}
              className="size-full object-cover"
            />
          ) : (
            <div className="size-full flex items-center justify-center">
              <User className="size-5 text-neutral-300" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-neutral-900">{person.display_name}</p>
          <p className="text-xs text-neutral-500">
            {person.shared_legacy_count} shared {person.shared_legacy_count === 1 ? 'legacy' : 'legacies'}
          </p>
        </div>
        <span className="px-2 py-0.5 rounded-full bg-neutral-100 text-xs font-medium text-neutral-600 capitalize">
          {person.highest_shared_role}
        </span>
      </div>

      <div className="space-y-1">
        {displayLegacies.map((legacy) => (
          <div key={legacy.legacy_id} className="flex items-center gap-2 text-xs text-neutral-500">
            <Landmark className="size-3 flex-shrink-0" />
            <span className="truncate">{legacy.legacy_name}</span>
          </div>
        ))}
        {overflow > 0 && (
          <p className="text-xs text-neutral-400 pl-5">+{overflow} more</p>
        )}
      </div>
    </div>
  );
}
