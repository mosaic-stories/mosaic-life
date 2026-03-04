import { Loader2, Users } from 'lucide-react';
import { usePeople } from '@/features/connections/hooks/useConnections';
import type { PeopleFilter } from '@/features/connections/api/connections';
import PersonCard from './PersonCard';
import QuickFilters from '@/components/legacies-hub/QuickFilters';
import type { FilterOption } from '@/components/legacies-hub/QuickFilters';

interface PeopleTabContentProps {
  activeFilter: string;
  onFilterChange: (key: string) => void;
}

export default function PeopleTabContent({ activeFilter, onFilterChange }: PeopleTabContentProps) {
  const { data, isLoading } = usePeople(activeFilter as PeopleFilter);

  const filterOptions: FilterOption[] = [
    { key: 'all', label: 'All', count: data?.counts?.all },
    { key: 'co_creators', label: 'Co-creators', count: data?.counts?.co_creators },
    { key: 'collaborators', label: 'Collaborators', count: data?.counts?.collaborators },
  ];

  return (
    <div className="space-y-6">
      <QuickFilters options={filterOptions} activeKey={activeFilter} onChange={onFilterChange} />

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-theme-primary" />
        </div>
      )}

      {!isLoading && data && data.items.length > 0 && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {data.items.map((person) => (
            <PersonCard key={person.user_id} person={person} />
          ))}
        </div>
      )}

      {!isLoading && (!data || data.items.length === 0) && (
        <div className="text-center py-12">
          <Users className="size-12 mx-auto text-neutral-300 mb-4" />
          <p className="text-neutral-600">
            {activeFilter === 'co_creators'
              ? 'No co-creators found.'
              : activeFilter === 'collaborators'
                ? 'No collaborators found.'
                : 'Invite someone to collaborate on a legacy to see your connections here.'}
          </p>
        </div>
      )}
    </div>
  );
}
