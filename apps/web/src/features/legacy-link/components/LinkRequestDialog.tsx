import { useState } from 'react';
import { Search, Link2, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { searchLegacies, type LegacySearchResult } from '@/features/legacy/api/legacies';
import { useCreateLinkRequest } from '@/features/legacy-link/hooks/useLegacyLinks';
import { useQuery } from '@tanstack/react-query';

interface LinkRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  legacyId: string;
  personId: string;
  legacyName: string;
}

export default function LinkRequestDialog({
  open,
  onOpenChange,
  legacyId,
  personId,
  legacyName,
}: LinkRequestDialogProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLegacy, setSelectedLegacy] = useState<LegacySearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const debouncedQuery = useDebounce(searchQuery.trim(), 300);
  const createLink = useCreateLinkRequest();

  const searchResults = useQuery({
    queryKey: ['legacy-search', debouncedQuery],
    queryFn: () => searchLegacies(debouncedQuery),
    enabled: debouncedQuery.length >= 2,
    staleTime: 10_000,
  });

  // Filter out the current legacy from search results
  const filteredResults = searchResults.data?.filter(
    (result) => result.id !== legacyId
  ) ?? [];

  const handleSubmit = async () => {
    if (!selectedLegacy) return;
    setError(null);

    try {
      await createLink.mutateAsync({
        requester_legacy_id: legacyId,
        target_legacy_id: selectedLegacy.id,
        person_id: personId,
      });
      onOpenChange(false);
      setSearchQuery('');
      setSelectedLegacy(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create link request';
      // Surface the backend validation message (e.g. "Both legacies must reference the same person")
      setError(message);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    setSearchQuery('');
    setSelectedLegacy(null);
    setError(null);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Request a Legacy Link</DialogTitle>
          <DialogDescription>
            Search for another legacy about the same person to request a content-sharing link.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-800">
              <AlertCircle className="size-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-400" />
            <Input
              placeholder="Search legacies by name..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSelectedLegacy(null);
                setError(null);
              }}
              className="pl-9"
            />
          </div>

          {selectedLegacy && (
            <div className="flex items-center justify-between p-3 rounded-lg border border-green-200 bg-green-50">
              <div className="flex items-center gap-2">
                <Link2 className="size-4 text-green-700" />
                <div>
                  <p className="text-sm font-medium text-green-900">{selectedLegacy.name}</p>
                  {(selectedLegacy.birth_date || selectedLegacy.death_date) && (
                    <p className="text-xs text-green-700">
                      {selectedLegacy.birth_date && new Date(selectedLegacy.birth_date).getFullYear()}
                      {selectedLegacy.birth_date && selectedLegacy.death_date && ' – '}
                      {selectedLegacy.death_date && new Date(selectedLegacy.death_date).getFullYear()}
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLegacy(null)}
                className="text-xs text-green-700 hover:text-green-900 underline"
              >
                Change
              </button>
            </div>
          )}

          {!selectedLegacy && debouncedQuery.length >= 2 && (
            <div className="max-h-48 overflow-y-auto rounded-lg border border-neutral-200">
              {searchResults.isLoading && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="size-4 animate-spin text-neutral-400" />
                </div>
              )}
              {!searchResults.isLoading && filteredResults.length === 0 && (
                <p className="py-4 text-center text-sm text-neutral-500">
                  No matching legacies found
                </p>
              )}
              {filteredResults.map((result) => (
                <button
                  key={result.id}
                  type="button"
                  onClick={() => setSelectedLegacy(result)}
                  className="w-full flex items-center gap-3 p-3 text-left hover:bg-neutral-50 border-b border-neutral-100 last:border-b-0 transition-colors"
                >
                  <Link2 className="size-4 text-neutral-400 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-neutral-900">{result.name}</p>
                    <p className="text-xs text-neutral-500">
                      {result.birth_date && new Date(result.birth_date).getFullYear()}
                      {result.birth_date && result.death_date && ' – '}
                      {result.death_date && new Date(result.death_date).getFullYear()}
                      {!result.birth_date && !result.death_date && 'No dates'}
                      {' · '}
                      {result.visibility}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}

          <p className="text-xs text-neutral-500">
            The other legacy's owner will need to accept your link request before content can be shared.
            Both legacies must reference the same person.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedLegacy || createLink.isPending}
            className="bg-theme-primary hover:bg-theme-primary-dark"
          >
            {createLink.isPending ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              'Send Link Request'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
