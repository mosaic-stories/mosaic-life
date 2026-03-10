import { useState, useMemo } from 'react';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { cn } from '@/components/ui/utils';

/** Gendered display labels for the six core relationship types. */
const GENDERED_LABELS: Record<string, Record<string, string>> = {
  parent: { male: 'Father', female: 'Mother' },
  child: { male: 'Son', female: 'Daughter' },
  sibling: { male: 'Brother', female: 'Sister' },
  grandparent: { male: 'Grandfather', female: 'Grandmother' },
  grandchild: { male: 'Grandson', female: 'Granddaughter' },
  spouse: { male: 'Husband', female: 'Wife' },
};

/** Common aliases that should match specific relationship types when searching. */
const SEARCH_ALIASES: Record<string, string[]> = {
  Mother: ['mom', 'mum', 'mama', 'mummy', 'ma'],
  Father: ['dad', 'papa', 'pop', 'daddy', 'pa'],
  Brother: ['bro'],
  Sister: ['sis'],
  Grandmother: ['grandma', 'nana', 'nan', 'granny'],
  Grandfather: ['grandpa', 'gramps', 'granddad'],
  Husband: ['hubby'],
  Wife: ['wifey'],
  Son: ['boy'],
  Daughter: ['girl'],
};

/** Base neutral relationship labels in display order. */
const BASE_RELATIONSHIPS: { value: string; label: string }[] = [
  { value: 'parent', label: 'Parent' },
  { value: 'child', label: 'Child' },
  { value: 'spouse', label: 'Spouse' },
  { value: 'sibling', label: 'Sibling' },
  { value: 'grandparent', label: 'Grandparent' },
  { value: 'grandchild', label: 'Grandchild' },
  { value: 'aunt', label: 'Aunt' },
  { value: 'uncle', label: 'Uncle' },
  { value: 'cousin', label: 'Cousin' },
  { value: 'niece', label: 'Niece' },
  { value: 'nephew', label: 'Nephew' },
  { value: 'in_law', label: 'In-Law' },
  { value: 'friend', label: 'Friend' },
  { value: 'colleague', label: 'Colleague' },
  { value: 'mentor', label: 'Mentor' },
  { value: 'mentee', label: 'Mentee' },
  { value: 'caregiver', label: 'Caregiver' },
  { value: 'neighbor', label: 'Neighbor' },
  { value: 'other', label: 'Other' },
];

interface RelationshipOption {
  value: string;
  label: string;
  aliases?: string[];
}

interface RelationshipComboboxProps {
  value: string;
  onChange: (value: string) => void;
  legacyGender?: string | null;
  placeholder?: string;
}

/**
 * Build the full options list based on legacy gender.
 * For gendered types, shows both the gendered and neutral term (gendered first).
 */
function buildOptions(legacyGender: string | null | undefined): RelationshipOption[] {
  const options: RelationshipOption[] = [];

  for (const base of BASE_RELATIONSHIPS) {
    const gendered = GENDERED_LABELS[base.value];

    if (gendered && legacyGender && gendered[legacyGender]) {
      const genderedLabel = gendered[legacyGender];
      // Add gendered term first with its aliases
      options.push({
        value: genderedLabel.toLowerCase(),
        label: genderedLabel,
        aliases: SEARCH_ALIASES[genderedLabel] || [],
      });
      // Then add the neutral term
      options.push({
        value: base.value,
        label: base.label,
      });
    } else {
      options.push({
        value: base.value,
        label: base.label,
      });
    }
  }

  return options;
}

export default function RelationshipCombobox({
  value,
  onChange,
  legacyGender,
  placeholder = 'Search relationship...',
}: RelationshipComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const options = useMemo(() => buildOptions(legacyGender), [legacyGender]);

  // Find display label for current value
  const displayLabel = useMemo(() => {
    if (!value) return '';
    const option = options.find((o) => o.value === value);
    if (option) return option.label;
    // Custom value — capitalize
    return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }, [value, options]);

  // Check if search matches any existing option (for "add custom" visibility)
  const searchLower = search.toLowerCase().trim();
  const hasExactMatch = searchLower
    ? options.some(
        (o) =>
          o.label.toLowerCase() === searchLower ||
          o.value === searchLower ||
          o.aliases?.some((a) => a === searchLower)
      )
    : true;

  // Custom filter: match on label, value, and aliases
  const filterFn = (optionValue: string, searchTerm: string) => {
    const term = searchTerm.toLowerCase();
    const option = options.find((o) => o.value === optionValue);
    if (!option) return 0;
    if (option.label.toLowerCase().includes(term)) return 1;
    if (option.value.includes(term)) return 1;
    if (option.aliases?.some((a) => a.includes(term))) return 1;
    return 0;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          {displayLabel || (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command filter={filterFn}>
          <CommandInput
            placeholder={placeholder}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>
              {searchLower && (
                <button
                  type="button"
                  className="flex items-center gap-2 w-full px-2 py-1.5 text-sm hover:bg-accent rounded-sm cursor-pointer"
                  onClick={() => {
                    onChange(searchLower);
                    setSearch('');
                    setOpen(false);
                  }}
                >
                  <Plus className="size-4" />
                  Add &ldquo;{search.trim()}&rdquo; as custom relationship
                </button>
              )}
            </CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  onSelect={(selected) => {
                    onChange(selected === value ? '' : selected);
                    setSearch('');
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 size-4',
                      value === option.value ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
            {/* Show "add custom" at end of list when typing something not matching exactly */}
            {searchLower && !hasExactMatch && (
              <CommandGroup>
                <CommandItem
                  value={`custom-${searchLower}`}
                  onSelect={() => {
                    onChange(searchLower);
                    setSearch('');
                    setOpen(false);
                  }}
                >
                  <Plus className="mr-2 size-4" />
                  Add &ldquo;{search.trim()}&rdquo; as custom relationship
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
