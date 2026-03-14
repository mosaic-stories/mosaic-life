# Relationship UX Improvements — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve the member relationship profile UX by converting nickname to multi-value tags, making relationship type a searchable combobox with gender-aware terms, moving editing to the legacy edit/create pages, and showing a compact summary in the profile header.

**Architecture:** Backend schema changes (`nickname` → `nicknames` list, `relationship_type` from enum to free string). Two new reusable frontend components (TagInput, RelationshipCombobox). ProfileHeader gets a compact relationship summary line. LegacyEdit and LegacyCreation pages get a collapsible relationship section. MyRelationshipSection component is deleted.

**Tech Stack:** Python/FastAPI, Pydantic, PostgreSQL JSONB, React/TypeScript, TanStack Query, shadcn/ui (Command + Popover), Tailwind CSS.

**Design Doc:** `docs/plans/2025-03-10-relationship-ux-improvements-design.md`

---

## Status

| Task | Status |
|------|--------|
| Task 1: Backend Schema Changes | Done |
| Task 2: Backend Test Updates | Done |
| Task 3: Backend — Add gender to LegacyCreate | Done |
| Task 4: Frontend — TagInput Component | Done |
| Task 5: Frontend — RelationshipCombobox Component | Done |
| Task 6: Frontend — Relationship Label Utilities | Done |
| Task 7: Frontend — API Types Update | Done |
| Task 8: Frontend — ProfileHeader Relationship Summary | Done |
| Task 9: Frontend — LegacyEdit Relationship Section | Done |
| Task 10: Frontend — LegacyCreation Updates | Done |
| Task 11: Frontend — Remove MyRelationshipSection | Done |
| Task 12: Final Validation | Done |

---

## Task 1: Backend Schema Changes

**Files:**
- Modify: `services/core-api/app/schemas/member_profile.py`
- Modify: `services/core-api/app/services/member_profile.py`

**Step 1: Update Pydantic schemas**

In `services/core-api/app/schemas/member_profile.py`, make these changes:

1. Remove the `RelationshipType` enum entirely (lines 8-29)
2. Change `MemberProfileUpdate.relationship_type` from `RelationshipType | None` to `str | None` with max_length=50
3. Change `MemberProfileUpdate.nickname` to `nicknames: list[str] | None = None`
4. Change `MemberProfileResponse.relationship_type` from `RelationshipType | None` to `str | None`
5. Change `MemberProfileResponse.nickname` to `nicknames: list[str] | None = None`
6. Add a `PREDEFINED_RELATIONSHIP_TYPES` constant for reference

The file should become:

```python
"""Pydantic schemas for member relationship profiles."""

from enum import Enum

from pydantic import BaseModel, Field, field_validator


class GenderType(str, Enum):
    """Supported gender options."""

    male = "male"
    female = "female"
    non_binary = "non_binary"
    prefer_not_to_say = "prefer_not_to_say"


# Predefined relationship types (not enforced server-side; used for frontend suggestions)
PREDEFINED_RELATIONSHIP_TYPES: list[str] = [
    "parent",
    "child",
    "spouse",
    "sibling",
    "grandparent",
    "grandchild",
    "aunt",
    "uncle",
    "cousin",
    "niece",
    "nephew",
    "in_law",
    "friend",
    "colleague",
    "mentor",
    "mentee",
    "caregiver",
    "neighbor",
    "other",
]


class MemberProfileUpdate(BaseModel):
    """Request to create or update a member's relationship profile."""

    relationship_type: str | None = Field(None, max_length=50)
    nicknames: list[str] | None = None
    legacy_to_viewer: str | None = Field(None, max_length=1000)
    viewer_to_legacy: str | None = Field(None, max_length=1000)
    character_traits: list[str] | None = None

    @field_validator("nicknames")
    @classmethod
    def validate_nicknames(cls, v: list[str] | None) -> list[str] | None:
        if v is not None:
            if len(v) > 10:
                msg = "Maximum 10 nicknames allowed"
                raise ValueError(msg)
            for name in v:
                if len(name) > 100:
                    msg = "Each nickname must be 100 characters or less"
                    raise ValueError(msg)
        return v


class MemberProfileResponse(BaseModel):
    """Response containing a member's relationship profile."""

    relationship_type: str | None = None
    nicknames: list[str] | None = None
    legacy_to_viewer: str | None = None
    viewer_to_legacy: str | None = None
    character_traits: list[str] | None = None
```

**Step 2: Update the service merge logic**

In `services/core-api/app/services/member_profile.py`, the merge logic at lines 66-72 currently handles enum `.value` extraction. Since `relationship_type` is now a plain string, simplify:

Replace lines 66-72:

```python
    # Merge: update only fields explicitly provided, including nulls for clears.
    for key in data.model_fields_set:
        value = getattr(data, key)
        if value is not None and hasattr(value, "value"):
            existing[key] = value.value
        else:
            existing[key] = value
```

With:

```python
    # Merge: update only fields explicitly provided, including nulls for clears.
    for key in data.model_fields_set:
        existing[key] = getattr(data, key)
```

The enum `.value` extraction is no longer needed since `relationship_type` is a plain string now.

**Step 3: Run validation**

```bash
just validate-backend
```

Expected: PASS. The import of `GenderType` in `services/core-api/app/schemas/legacy.py` still works since we kept `GenderType` in the same file.

**Step 4: Commit**

```bash
git add services/core-api/app/schemas/member_profile.py services/core-api/app/services/member_profile.py
git commit -m "refactor: change nickname to nicknames list and relationship_type to free string"
```

---

## Task 2: Backend Test Updates

**Files:**
- Modify: `services/core-api/tests/test_member_profile_model.py`
- Modify: `services/core-api/tests/test_member_profile_service.py`
- Modify: `services/core-api/tests/test_member_profile_routes.py`

**Step 1: Update model tests**

In `services/core-api/tests/test_member_profile_model.py`, update the `member_with_profile` fixture (line 25-31) to use `nicknames` instead of `nickname`:

Replace:
```python
    member.profile = {
        "relationship_type": "parent",
        "nickname": "Mom",
        "legacy_to_viewer": "She was my guiding light.",
        "viewer_to_legacy": "Her youngest child.",
        "character_traits": ["kind", "resilient", "funny"],
    }
```

With:
```python
    member.profile = {
        "relationship_type": "parent",
        "nicknames": ["Mom", "Mama"],
        "legacy_to_viewer": "She was my guiding light.",
        "viewer_to_legacy": "Her youngest child.",
        "character_traits": ["kind", "resilient", "funny"],
    }
```

Update `test_legacy_member_profile_stores_jsonb` (line 60-62):

Replace:
```python
    assert member_with_profile.profile["nickname"] == "Mom"
```

With:
```python
    assert member_with_profile.profile["nicknames"] == ["Mom", "Mama"]
```

**Step 2: Update service tests**

In `services/core-api/tests/test_member_profile_service.py`:

Update `test_update_profile_creates_new` (lines 26-34) — change `nickname="Mom"` to `nicknames=["Mom"]` and assertion from `result.nickname` to `result.nicknames`:

```python
    data = MemberProfileUpdate(
        relationship_type="parent",
        nicknames=["Mom"],
    )
    result = await update_profile(db_session, test_legacy.id, test_user.id, data)
    assert result is not None
    assert result.relationship_type == "parent"
    assert result.nicknames == ["Mom"]
    assert result.legacy_to_viewer is None
```

Update `test_update_profile_merges_partial` (lines 43-55) — change `nickname` to `nicknames`:

```python
    data1 = MemberProfileUpdate(
        relationship_type="parent",
        nicknames=["Mom"],
    )
    await update_profile(db_session, test_legacy.id, test_user.id, data1)

    data2 = MemberProfileUpdate(nicknames=["Mom", "Mama"])
    result = await update_profile(db_session, test_legacy.id, test_user.id, data2)

    assert result is not None
    assert result.relationship_type == "parent"  # preserved
    assert result.nicknames == ["Mom", "Mama"]  # updated
```

Update `test_update_profile_clears_explicit_nulls_and_empty_list` (lines 72-106) — change `nickname` to `nicknames`:

First update call: change `nickname="Mom"` to `nicknames=["Mom"]`
Second update call: change `nickname=None` to `nicknames=None`
Assertions: change `result.nickname` to `result.nicknames`

```python
    await update_profile(
        db_session,
        test_legacy.id,
        test_user.id,
        MemberProfileUpdate(
            relationship_type="parent",
            nicknames=["Mom"],
            legacy_to_viewer="She raised me",
            viewer_to_legacy="I am her child",
            character_traits=["kind", "funny"],
        ),
    )

    result = await update_profile(
        db_session,
        test_legacy.id,
        test_user.id,
        MemberProfileUpdate(
            relationship_type=None,
            nicknames=None,
            legacy_to_viewer=None,
            character_traits=[],
        ),
    )

    assert result is not None
    assert result.relationship_type is None
    assert result.nicknames is None
    assert result.legacy_to_viewer is None
    assert result.viewer_to_legacy == "I am her child"
    assert result.character_traits == []
```

Update `test_get_profile_after_update` (lines 110-128) — change `nickname` to `nicknames`:

```python
    data = MemberProfileUpdate(
        relationship_type="sibling",
        nicknames=["Sis"],
        legacy_to_viewer="My older sister",
        viewer_to_legacy="Her little brother",
        character_traits=["brave"],
    )
    await update_profile(db_session, test_legacy.id, test_user.id, data)
    result = await get_profile(db_session, test_legacy.id, test_user.id)
    assert result is not None
    assert result.relationship_type == "sibling"
    assert result.nicknames == ["Sis"]
    assert result.legacy_to_viewer == "My older sister"
    assert result.viewer_to_legacy == "Her little brother"
    assert result.character_traits == ["brave"]
```

Update `test_update_profile_non_member_raises` (line 138) — change `nickname` to `nicknames`:

```python
    data = MemberProfileUpdate(nicknames=["Test"])
```

Add a new test for custom relationship types (since we no longer have an enum):

```python
@pytest.mark.asyncio
async def test_update_profile_with_custom_relationship_type(
    db_session: AsyncSession, test_legacy: Legacy, test_user: User
) -> None:
    """update_profile accepts custom relationship types."""
    data = MemberProfileUpdate(
        relationship_type="godmother",
        nicknames=["Auntie G"],
    )
    result = await update_profile(db_session, test_legacy.id, test_user.id, data)
    assert result is not None
    assert result.relationship_type == "godmother"
    assert result.nicknames == ["Auntie G"]
```

**Step 3: Update route tests**

In `services/core-api/tests/test_member_profile_routes.py`:

Update `test_put_profile_creates` (lines 30-43) — change `nickname` to `nicknames`:

```python
    response = await client.put(
        f"/api/legacies/{test_legacy.id}/profile",
        json={
            "relationship_type": "parent",
            "nicknames": ["Mom"],
            "character_traits": ["kind", "warm"],
        },
        headers=headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["relationship_type"] == "parent"
    assert data["nicknames"] == ["Mom"]
    assert data["character_traits"] == ["kind", "warm"]
```

Update `test_put_profile_partial_update` (lines 47-67) — change `nickname` to `nicknames`:

```python
    await client.put(
        f"/api/legacies/{test_legacy.id}/profile",
        json={"relationship_type": "parent", "nicknames": ["Mom"]},
        headers=headers,
    )
    response = await client.put(
        f"/api/legacies/{test_legacy.id}/profile",
        json={"nicknames": ["Mom", "Mama"]},
        headers=headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["relationship_type"] == "parent"  # preserved
    assert data["nicknames"] == ["Mom", "Mama"]  # updated
```

Update `test_get_profile_after_update` (lines 70-87) — change `nickname` to `nicknames`:

```python
    await client.put(
        f"/api/legacies/{test_legacy.id}/profile",
        json={"relationship_type": "sibling", "nicknames": ["Bro"]},
        headers=headers,
    )
    response = await client.get(
        f"/api/legacies/{test_legacy.id}/profile", headers=headers
    )
    assert response.status_code == 200
    data = response.json()
    assert data["relationship_type"] == "sibling"
    assert data["nicknames"] == ["Bro"]
```

Update `test_put_profile_invalid_relationship_type` (lines 109-120) — since relationship_type is now a free string, this test should now expect 200 instead of 422. Change the test to verify custom types are accepted:

```python
@pytest.mark.asyncio
async def test_put_profile_accepts_custom_relationship_type(
    client: AsyncClient, test_legacy: Legacy, test_user: User
) -> None:
    """PUT accepts custom relationship_type values."""
    headers = create_auth_headers_for_user(test_user)
    response = await client.put(
        f"/api/legacies/{test_legacy.id}/profile",
        json={"relationship_type": "godmother"},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["relationship_type"] == "godmother"
```

Add a test for nicknames validation:

```python
@pytest.mark.asyncio
async def test_put_profile_rejects_too_many_nicknames(
    client: AsyncClient, test_legacy: Legacy, test_user: User
) -> None:
    """PUT rejects more than 10 nicknames."""
    headers = create_auth_headers_for_user(test_user)
    response = await client.put(
        f"/api/legacies/{test_legacy.id}/profile",
        json={"nicknames": [f"name{i}" for i in range(11)]},
        headers=headers,
    )
    assert response.status_code == 422
```

**Step 4: Run all backend tests**

```bash
cd /apps/mosaic-life/services/core-api
uv run pytest tests/test_member_profile_model.py tests/test_member_profile_service.py tests/test_member_profile_routes.py -v
```

Expected: All tests PASS.

**Step 5: Run full validation**

```bash
just validate-backend
```

Expected: PASS.

**Step 6: Commit**

```bash
git add services/core-api/tests/test_member_profile_model.py services/core-api/tests/test_member_profile_service.py services/core-api/tests/test_member_profile_routes.py
git commit -m "test: update member profile tests for nicknames list and free-string relationship type"
```

---

## Task 3: Backend — Add gender to LegacyCreate

**Files:**
- Modify: `services/core-api/app/schemas/legacy.py` (line 12-31, LegacyCreate class)
- Modify: `services/core-api/app/services/legacy.py` (create_legacy function)
- Modify: `apps/web/src/features/legacy/api/legacies.ts` (CreateLegacyInput interface)

**Step 1: Add gender to LegacyCreate schema**

In `services/core-api/app/schemas/legacy.py`, add to the `LegacyCreate` class after `visibility` (line 27):

```python
    gender: GenderType | None = Field(None, description="Gender of the legacy subject")
```

**Step 2: Handle gender in create_legacy service**

Find the `create_legacy` function in `services/core-api/app/services/legacy.py`. Where the `Legacy` model is constructed, add `gender=data.gender` if gender is in the schema. Look for where `Legacy(...)` is created and add the gender field.

**Step 3: Run tests**

```bash
cd /apps/mosaic-life/services/core-api
uv run pytest tests/test_gender_fields.py -v
just validate-backend
```

Expected: PASS.

**Step 4: Commit**

```bash
git add services/core-api/app/schemas/legacy.py services/core-api/app/services/legacy.py
git commit -m "feat: add gender field to LegacyCreate schema"
```

---

## Task 4: Frontend — TagInput Component

**Files:**
- Create: `apps/web/src/components/ui/tag-input.tsx`

**Step 1: Create the TagInput component**

This extracts the inline traits pattern from MyRelationshipSection into a reusable component. Uses the same styling conventions as existing shadcn/ui components.

Create `apps/web/src/components/ui/tag-input.tsx`:

```tsx
import { useState } from 'react';
import { X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface TagInputProps {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  maxItems?: number;
  maxLength?: number;
  id?: string;
}

export default function TagInput({
  values,
  onChange,
  placeholder = 'Type and press Enter...',
  maxItems,
  maxLength = 100,
  id,
}: TagInputProps) {
  const [input, setInput] = useState('');

  const atMax = maxItems !== undefined && values.length >= maxItems;

  const addTag = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    if (values.some((v) => v.toLowerCase() === trimmed.toLowerCase())) {
      setInput('');
      return;
    }
    if (atMax) return;
    onChange([...values, trimmed]);
    setInput('');
  };

  const removeTag = (tag: string) => {
    onChange(values.filter((v) => v !== tag));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag();
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          id={id}
          placeholder={atMax ? `Maximum ${maxItems} reached` : placeholder}
          value={input}
          onChange={(e) => setInput(e.target.value.slice(0, maxLength))}
          onKeyDown={handleKeyDown}
          disabled={atMax}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addTag}
          disabled={!input.trim() || atMax}
        >
          Add
        </Button>
      </div>
      {maxItems !== undefined && values.length > 0 && (
        <p className="text-xs text-neutral-400">
          {values.length}/{maxItems}
        </p>
      )}
      {values.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {values.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 px-3 py-1 bg-theme-accent-light text-theme-primary text-sm rounded-full"
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="hover:text-red-500 transition-colors"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Verify it builds**

```bash
cd /apps/mosaic-life/apps/web
npx tsc --noEmit
```

Expected: No type errors.

**Step 3: Commit**

```bash
git add apps/web/src/components/ui/tag-input.tsx
git commit -m "feat: add reusable TagInput component"
```

---

## Task 5: Frontend — RelationshipCombobox Component

**Files:**
- Create: `apps/web/src/components/ui/relationship-combobox.tsx`

This uses the existing shadcn Command + Popover components to create a searchable dropdown with gender-aware terms and custom entry support.

**Step 1: Create the component**

Create `apps/web/src/components/ui/relationship-combobox.tsx`:

```tsx
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
```

**Step 2: Verify it builds**

```bash
cd /apps/mosaic-life/apps/web
npx tsc --noEmit
```

Expected: No type errors.

**Step 3: Commit**

```bash
git add apps/web/src/components/ui/relationship-combobox.tsx
git commit -m "feat: add RelationshipCombobox with gender-aware terms and custom entry"
```

---

## Task 6: Frontend — Relationship Label Utilities

**Files:**
- Modify: `apps/web/src/features/members/api/memberProfile.ts`

**Step 1: Update types and add display utilities**

Replace the entire file content:

```typescript
import { apiGet, apiPut } from '@/lib/api/client';

export interface MemberProfile {
  relationship_type: string | null;
  nicknames: string[] | null;
  legacy_to_viewer: string | null;
  viewer_to_legacy: string | null;
  character_traits: string[] | null;
}

export interface MemberProfileUpdate {
  relationship_type?: string | null;
  nicknames?: string[] | null;
  legacy_to_viewer?: string | null;
  viewer_to_legacy?: string | null;
  character_traits?: string[];
}

/** Gender-aware display labels for the six gendered relationship types. */
const GENDERED_DISPLAY_LABELS: Record<string, Record<string, string>> = {
  parent: { male: 'Father', female: 'Mother' },
  child: { male: 'Son', female: 'Daughter' },
  sibling: { male: 'Brother', female: 'Sister' },
  grandparent: { male: 'Grandfather', female: 'Grandmother' },
  grandchild: { male: 'Grandson', female: 'Granddaughter' },
  spouse: { male: 'Husband', female: 'Wife' },
};

/** Neutral display labels for predefined relationship types. */
const NEUTRAL_LABELS: Record<string, string> = {
  parent: 'Parent',
  child: 'Child',
  spouse: 'Spouse',
  sibling: 'Sibling',
  grandparent: 'Grandparent',
  grandchild: 'Grandchild',
  aunt: 'Aunt',
  uncle: 'Uncle',
  cousin: 'Cousin',
  niece: 'Niece',
  nephew: 'Nephew',
  in_law: 'In-Law',
  friend: 'Friend',
  colleague: 'Colleague',
  mentor: 'Mentor',
  mentee: 'Mentee',
  caregiver: 'Caregiver',
  neighbor: 'Neighbor',
  other: 'Other',
};

/**
 * Get the display label for a relationship type, respecting legacy gender.
 * Falls back to neutral label, then to a capitalized version of the raw value.
 */
export function getRelationshipDisplayLabel(
  relationshipType: string,
  legacyGender: string | null | undefined
): string {
  const gendered = GENDERED_DISPLAY_LABELS[relationshipType];
  if (gendered && legacyGender && gendered[legacyGender]) {
    return gendered[legacyGender];
  }
  if (NEUTRAL_LABELS[relationshipType]) {
    return NEUTRAL_LABELS[relationshipType];
  }
  // Custom value — capitalize
  return relationshipType
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function getMemberProfile(
  legacyId: string
): Promise<MemberProfile | null> {
  return apiGet<MemberProfile | null>(`/api/legacies/${legacyId}/profile`);
}

export async function updateMemberProfile(
  legacyId: string,
  data: MemberProfileUpdate
): Promise<MemberProfile> {
  return apiPut<MemberProfile>(`/api/legacies/${legacyId}/profile`, data);
}
```

**Step 2: Verify it builds**

```bash
cd /apps/mosaic-life/apps/web
npx tsc --noEmit
```

Expected: No type errors.

**Step 3: Commit**

```bash
git add apps/web/src/features/members/api/memberProfile.ts
git commit -m "feat: update member profile types for nicknames and add gender-aware label utility"
```

---

## Task 7: Frontend — API Types Update

**Files:**
- Modify: `apps/web/src/features/legacy/api/legacies.ts` (CreateLegacyInput interface, line 50-57)

**Step 1: Add gender to CreateLegacyInput**

In `apps/web/src/features/legacy/api/legacies.ts`, add `gender` to the `CreateLegacyInput` interface (after `biography`, line 54):

```typescript
  gender?: string | null;
```

**Step 2: Verify it builds**

```bash
cd /apps/mosaic-life/apps/web
npx tsc --noEmit
```

Expected: No type errors.

**Step 3: Commit**

```bash
git add apps/web/src/features/legacy/api/legacies.ts
git commit -m "feat: add gender to CreateLegacyInput interface"
```

---

## Task 8: Frontend — ProfileHeader Relationship Summary

**Files:**
- Modify: `apps/web/src/features/legacy/components/ProfileHeader.tsx`

**Step 1: Add relationship summary to ProfileHeader**

Update ProfileHeader to accept member profile data and display a compact summary line.

Add to the `ProfileHeaderProps` interface:

```typescript
import { getRelationshipDisplayLabel } from '@/features/members/api/memberProfile';
import type { MemberProfile } from '@/features/members/api/memberProfile';
```

Update the props:

```typescript
export interface ProfileHeaderProps {
  legacy: Legacy;
  dates: string;
  storyCount: number;
  memberCount: number;
  onMembersClick: () => void;
  memberProfile?: MemberProfile | null;
  isMember?: boolean;
  legacyId: string;
}
```

Inside the component, between the biography `<p>` tag (line 54) and the stats `<div>` (line 57), add the relationship summary line:

```tsx
{/* Relationship summary */}
{isMember && (
  <RelationshipSummary
    profile={memberProfile ?? null}
    legacyGender={legacy.gender ?? null}
    legacyName={legacy.name}
    legacyId={legacyId}
  />
)}
```

Add a `RelationshipSummary` sub-component in the same file (before the default export):

```tsx
function RelationshipSummary({
  profile,
  legacyGender,
  legacyName,
  legacyId,
}: {
  profile: MemberProfile | null;
  legacyGender: string | null;
  legacyName: string;
  legacyId: string;
}) {
  const navigate = useNavigate();

  const hasProfile =
    profile &&
    (profile.relationship_type ||
      (profile.nicknames && profile.nicknames.length > 0) ||
      (profile.character_traits && profile.character_traits.length > 0));

  if (!hasProfile) {
    return (
      <button
        onClick={() => navigate(`/legacy/${legacyId}/edit?section=relationship`)}
        className="text-sm text-theme-primary hover:text-theme-primary-dark transition-colors"
      >
        Describe your relationship with {legacyName} &rarr;
      </button>
    );
  }

  const MAX_NICKNAMES = 3;
  const MAX_TRAITS = 5;

  const segments: React.ReactNode[] = [];

  // Relationship label
  if (profile.relationship_type) {
    segments.push(
      <span key="rel" className="font-medium text-neutral-900">
        {getRelationshipDisplayLabel(profile.relationship_type, legacyGender)}
      </span>
    );
  }

  // Nicknames
  if (profile.nicknames && profile.nicknames.length > 0) {
    const visible = profile.nicknames.slice(0, MAX_NICKNAMES);
    const extra = profile.nicknames.length - MAX_NICKNAMES;
    segments.push(
      <span key="nick" className="text-neutral-600">
        {visible.map((n) => `\u201c${n}\u201d`).join(', ')}
        {extra > 0 && (
          <span className="text-neutral-400"> +{extra} more</span>
        )}
      </span>
    );
  }

  // Character traits
  if (profile.character_traits && profile.character_traits.length > 0) {
    const visible = profile.character_traits.slice(0, MAX_TRAITS);
    const extra = profile.character_traits.length - MAX_TRAITS;
    segments.push(
      <span key="traits" className="inline-flex items-center gap-1.5 flex-wrap">
        {visible.map((trait) => (
          <span
            key={trait}
            className="px-2 py-0.5 bg-theme-accent-light text-theme-primary text-xs rounded-full"
          >
            {trait}
          </span>
        ))}
        {extra > 0 && (
          <span className="text-xs text-neutral-400">+{extra} more</span>
        )}
      </span>
    );
  }

  return (
    <button
      onClick={() => navigate(`/legacy/${legacyId}/edit?section=relationship`)}
      className="flex items-center gap-2 flex-wrap text-sm hover:opacity-80 transition-opacity"
    >
      {segments.map((segment, i) => (
        <span key={i} className="flex items-center gap-2">
          {i > 0 && <span className="text-neutral-300">&middot;</span>}
          {segment}
        </span>
      ))}
    </button>
  );
}
```

Add `useNavigate` import at the top of the file:

```typescript
import { useNavigate } from 'react-router-dom';
```

**Step 2: Update LegacyProfile to pass profile data to ProfileHeader**

In `apps/web/src/features/legacy/components/LegacyProfile.tsx`:

Add import for `useMemberProfile`:

```typescript
import { useMemberProfile } from '@/features/members/hooks/useMemberProfile';
```

Inside the component (after the `currentUserRole` computation, ~line 79), add:

```typescript
const memberProfileQuery = useMemberProfile(legacyId);
```

Note: `useMemberProfile` will be called unconditionally. The hook itself can handle the case where the user is not a member (it will return null or error which we handle gracefully).

Update the `<ProfileHeader>` call (lines 228-234) to pass the new props:

```tsx
<ProfileHeader
  legacy={legacy}
  dates={dates}
  storyCount={storyCount}
  memberCount={memberCount}
  onMembersClick={() => setShowMemberDrawer(true)}
  memberProfile={memberProfileQuery.data}
  isMember={isMember}
  legacyId={legacyId}
/>
```

**Step 3: Verify it builds**

```bash
cd /apps/mosaic-life/apps/web
npx tsc --noEmit
```

Expected: No type errors.

**Step 4: Commit**

```bash
git add apps/web/src/features/legacy/components/ProfileHeader.tsx apps/web/src/features/legacy/components/LegacyProfile.tsx
git commit -m "feat: add compact relationship summary to ProfileHeader"
```

---

## Task 9: Frontend — LegacyEdit Relationship Section

**Files:**
- Modify: `apps/web/src/features/legacy/components/LegacyEdit.tsx`

This is the largest frontend change. We add a collapsible "My Relationship" section between the visibility toggle and the Save/Cancel buttons.

**Step 1: Add imports**

Add at the top of `LegacyEdit.tsx`:

```typescript
import { ChevronDown, ChevronUp, Heart } from 'lucide-react';
import TagInput from '@/components/ui/tag-input';
import RelationshipCombobox from '@/components/ui/relationship-combobox';
import { Textarea } from '@/components/ui/textarea';
import {
  useMemberProfile,
  useUpdateMemberProfile,
} from '@/features/members/hooks/useMemberProfile';
```

Note: `Textarea` and `Label` are already imported.

**Step 2: Add relationship state**

Inside the component, after the existing state declarations (line 30), add:

```typescript
// Relationship profile state
const [relationshipExpanded, setRelationshipExpanded] = useState(false);
const [relationshipType, setRelationshipType] = useState('');
const [nicknames, setNicknames] = useState<string[]>([]);
const [legacyToViewer, setLegacyToViewer] = useState('');
const [viewerToLegacy, setViewerToLegacy] = useState('');
const [traits, setTraits] = useState<string[]>([]);
const [profileInitialized, setProfileInitialized] = useState(false);

const memberProfileQuery = useMemberProfile(legacyId);
const updateMemberProfile = useUpdateMemberProfile(legacyId);
```

**Step 3: Initialize relationship state from profile data**

Add a second `useEffect` after the existing legacy initialization (after line 44):

```typescript
// Initialize relationship profile when it loads
useEffect(() => {
  const profile = memberProfileQuery.data;
  if (profile && !profileInitialized) {
    setRelationshipType(profile.relationship_type || '');
    setNicknames(profile.nicknames || []);
    setLegacyToViewer(profile.legacy_to_viewer || '');
    setViewerToLegacy(profile.viewer_to_legacy || '');
    setTraits(profile.character_traits || []);
    setProfileInitialized(true);
    // Auto-expand if profile has data
    if (
      profile.relationship_type ||
      (profile.nicknames && profile.nicknames.length > 0) ||
      profile.legacy_to_viewer ||
      profile.viewer_to_legacy ||
      (profile.character_traits && profile.character_traits.length > 0)
    ) {
      setRelationshipExpanded(true);
    }
  }
}, [memberProfileQuery.data, profileInitialized]);
```

Also check for query param to auto-expand:

```typescript
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('section') === 'relationship') {
    setRelationshipExpanded(true);
  }
}, []);
```

**Step 4: Update handleSubmit to save both**

Replace the `handleSubmit` function (lines 46-74) with:

```typescript
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setError(null);

  if (!name.trim()) {
    setError('Please enter a name for the legacy');
    return;
  }

  try {
    const legacyPromise = updateLegacy.mutateAsync({
      id: legacyId,
      data: {
        name: name.trim(),
        birth_date: birthDate || null,
        death_date: deathDate || null,
        biography: normalizeOptionalText(biography),
        gender: normalizeOptionalText(gender),
        visibility,
      },
    });

    // Build profile update — only include fields that have values
    const profileData: Record<string, unknown> = {};
    profileData.relationship_type = relationshipType || null;
    profileData.nicknames = nicknames.length > 0 ? nicknames : null;
    profileData.legacy_to_viewer = normalizeOptionalText(legacyToViewer);
    profileData.viewer_to_legacy = normalizeOptionalText(viewerToLegacy);
    profileData.character_traits = traits;

    const profilePromise = updateMemberProfile.mutateAsync(profileData);

    await Promise.all([legacyPromise, profilePromise]);

    navigate(`/legacy/${legacyId}`);
  } catch (err) {
    setError('Failed to save changes. Please try again.');
    console.error('Error saving:', err);
  }
};
```

**Step 5: Add the relationship section in the form**

Between the visibility section (ends at line 254) and the button row (starts at line 256), add:

```tsx
{/* My Relationship section */}
<div className="border border-neutral-200 rounded-lg overflow-hidden">
  <button
    type="button"
    onClick={() => setRelationshipExpanded(!relationshipExpanded)}
    className="w-full flex items-center justify-between p-4 text-left hover:bg-neutral-50 transition-colors"
  >
    <div className="flex items-center gap-3">
      <Heart className="size-5 text-theme-primary" />
      <div>
        <span className="font-medium text-neutral-900">My Relationship</span>
        <span className="text-sm text-neutral-500 ml-2">(optional)</span>
      </div>
    </div>
    {relationshipExpanded ? (
      <ChevronUp className="size-5 text-neutral-400" />
    ) : (
      <ChevronDown className="size-5 text-neutral-400" />
    )}
  </button>

  {relationshipExpanded && (
    <div className="px-4 pb-4 border-t border-neutral-100 pt-4 space-y-5">
      <p className="text-sm text-neutral-500">
        Describe your personal relationship with this person. This is private to you.
      </p>

      <div className="space-y-2">
        <Label htmlFor="relationshipType">Relationship</Label>
        <RelationshipCombobox
          value={relationshipType}
          onChange={setRelationshipType}
          legacyGender={gender || legacy?.gender}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="nicknames">What do you call them?</Label>
        <TagInput
          id="nicknames"
          values={nicknames}
          onChange={setNicknames}
          placeholder="Type a name and press Enter..."
          maxItems={10}
          maxLength={100}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="legacyToViewer">Who they are to you</Label>
        <Textarea
          id="legacyToViewer"
          placeholder="In your own words, describe who this person is to you..."
          value={legacyToViewer}
          onChange={(e) => setLegacyToViewer(e.target.value)}
          rows={3}
          maxLength={1000}
        />
        <p className="text-xs text-neutral-400">
          {legacyToViewer.length}/1000
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="viewerToLegacy">Who you are to them</Label>
        <Textarea
          id="viewerToLegacy"
          placeholder="How would they describe your role in their life?"
          value={viewerToLegacy}
          onChange={(e) => setViewerToLegacy(e.target.value)}
          rows={3}
          maxLength={1000}
        />
        <p className="text-xs text-neutral-400">
          {viewerToLegacy.length}/1000
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="characterTraits">Character traits</Label>
        <TagInput
          id="characterTraits"
          values={traits}
          onChange={setTraits}
          placeholder="Type a trait and press Enter..."
          maxItems={20}
        />
      </div>
    </div>
  )}
</div>
```

**Step 6: Update the save button disabled state**

Update the Save button's `disabled` prop to account for both mutations:

```tsx
disabled={updateLegacy.isPending || updateMemberProfile.isPending}
```

And the loading state:

```tsx
{(updateLegacy.isPending || updateMemberProfile.isPending) ? (
  <>
    <Loader2 className="size-4 mr-2 animate-spin" />
    Saving...
  </>
) : (
  'Save Changes'
)}
```

**Step 7: Verify it builds**

```bash
cd /apps/mosaic-life/apps/web
npx tsc --noEmit
```

Expected: No type errors.

**Step 8: Commit**

```bash
git add apps/web/src/features/legacy/components/LegacyEdit.tsx
git commit -m "feat: add collapsible relationship section to LegacyEdit page"
```

---

## Task 10: Frontend — LegacyCreation Updates

**Files:**
- Modify: `apps/web/src/features/legacy/components/LegacyCreation.tsx`

**Step 1: Add imports**

Add at the top:

```typescript
import { ChevronDown, ChevronUp, Heart } from 'lucide-react';
import TagInput from '@/components/ui/tag-input';
import RelationshipCombobox from '@/components/ui/relationship-combobox';
import { Textarea } from '@/components/ui/textarea';
import { updateMemberProfile } from '@/features/members/api/memberProfile';
import { normalizeOptionalText } from '@/lib/form-utils';
```

Note: `Textarea` and `Label` are already imported.

**Step 2: Add gender and relationship state**

After the existing state declarations (after line 26), add:

```typescript
const [gender, setGender] = useState('');

// Relationship profile state
const [relationshipExpanded, setRelationshipExpanded] = useState(false);
const [relationshipType, setRelationshipType] = useState('');
const [nicknames, setNicknames] = useState<string[]>([]);
const [legacyToViewer, setLegacyToViewer] = useState('');
const [viewerToLegacy, setViewerToLegacy] = useState('');
const [traits, setTraits] = useState<string[]>([]);
```

**Step 3: Update handleSubmit**

Replace the `handleSubmit` function (lines 39-64) with:

```typescript
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setError(null);

  if (!name.trim()) {
    setError('Please enter a name for the legacy');
    return;
  }

  try {
    const legacy = await createLegacy.mutateAsync({
      name: name.trim(),
      birth_date: birthDate || null,
      death_date: deathDate || null,
      biography: biography.trim() || null,
      gender: normalizeOptionalText(gender),
      visibility,
      person_id: selectedPerson?.person_id ?? null,
    });

    // Save relationship profile if any fields were filled
    const hasRelationshipData =
      relationshipType ||
      nicknames.length > 0 ||
      legacyToViewer.trim() ||
      viewerToLegacy.trim() ||
      traits.length > 0;

    if (hasRelationshipData) {
      await updateMemberProfile(legacy.id, {
        relationship_type: relationshipType || null,
        nicknames: nicknames.length > 0 ? nicknames : null,
        legacy_to_viewer: normalizeOptionalText(legacyToViewer),
        viewer_to_legacy: normalizeOptionalText(viewerToLegacy),
        character_traits: traits,
      });
    }

    navigate(`/legacy/${legacy.id}`);
  } catch (err) {
    setError('Failed to create legacy. Please try again.');
    console.error('Error creating legacy:', err);
  }
};
```

**Step 4: Add gender dropdown after biography section**

After the biography `<div>` (after line 209), add:

```tsx
<div className="space-y-2">
  <Label htmlFor="gender">Gender</Label>
  <select
    id="gender"
    value={gender}
    onChange={(e) => setGender(e.target.value)}
    className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-theme-primary"
  >
    <option value="">Not specified</option>
    <option value="male">Male</option>
    <option value="female">Female</option>
    <option value="non_binary">Non-binary</option>
    <option value="prefer_not_to_say">Prefer not to say</option>
  </select>
  <p className="text-xs text-neutral-500">
    Used to personalize AI conversations about this person.
  </p>
</div>
```

**Step 5: Add collapsible relationship section**

After the visibility section (after line 256) and before the button row (line 258), add the same collapsible relationship section as in LegacyEdit (from Task 9 Step 5), but using `gender` directly instead of `gender || legacy?.gender` for the combobox prop since there's no existing legacy:

```tsx
<RelationshipCombobox
  value={relationshipType}
  onChange={setRelationshipType}
  legacyGender={gender || null}
/>
```

**Step 6: Verify it builds**

```bash
cd /apps/mosaic-life/apps/web
npx tsc --noEmit
```

Expected: No type errors.

**Step 7: Commit**

```bash
git add apps/web/src/features/legacy/components/LegacyCreation.tsx
git commit -m "feat: add gender and relationship section to LegacyCreation page"
```

---

## Task 11: Frontend — Remove MyRelationshipSection

**Files:**
- Delete: `apps/web/src/features/members/components/MyRelationshipSection.tsx`
- Modify: `apps/web/src/features/legacy/components/LegacyProfile.tsx`

**Step 1: Remove MyRelationshipSection from LegacyProfile**

In `apps/web/src/features/legacy/components/LegacyProfile.tsx`:

Remove the import (line 19):
```typescript
import MyRelationshipSection from '@/features/members/components/MyRelationshipSection';
```

Remove the usage (lines 236-238):
```tsx
{isMember && (
  <MyRelationshipSection legacyId={legacyId} legacyName={legacy.name} />
)}
```

**Step 2: Delete MyRelationshipSection.tsx**

```bash
rm apps/web/src/features/members/components/MyRelationshipSection.tsx
```

**Step 3: Check for any other references to the deleted file**

```bash
cd /apps/mosaic-life
grep -r "MyRelationshipSection" apps/web/src/ --include="*.ts" --include="*.tsx"
```

Expected: No results.

**Step 4: Verify it builds**

```bash
cd /apps/mosaic-life/apps/web
npx tsc --noEmit
```

Expected: No type errors.

**Step 5: Commit**

```bash
git add apps/web/src/features/legacy/components/LegacyProfile.tsx
git rm apps/web/src/features/members/components/MyRelationshipSection.tsx
git commit -m "refactor: remove MyRelationshipSection, replaced by ProfileHeader summary + edit page"
```

---

## Task 12: Final Validation

**Files:** None (validation only)

**Step 1: Run all backend tests**

```bash
cd /apps/mosaic-life/services/core-api
uv run pytest -v
```

Expected: All tests PASS.

**Step 2: Run backend validation**

```bash
just validate-backend
```

Expected: ruff + mypy clean.

**Step 3: Run frontend lint**

```bash
cd /apps/mosaic-life/apps/web
npm run lint
```

Expected: Clean.

**Step 4: Run frontend build**

```bash
cd /apps/mosaic-life/apps/web
npm run build
```

Expected: Build succeeds.

**Step 5: Run frontend tests**

```bash
cd /apps/mosaic-life/apps/web
npm run test
```

Expected: All tests PASS.

---

## Summary of All Files Touched

### Created
- `apps/web/src/components/ui/tag-input.tsx` — Reusable tag/chip input
- `apps/web/src/components/ui/relationship-combobox.tsx` — Searchable combobox with gender-aware terms

### Modified (Backend)
- `services/core-api/app/schemas/member_profile.py` — `nickname` → `nicknames`, enum → free string
- `services/core-api/app/schemas/legacy.py` — Add gender to LegacyCreate
- `services/core-api/app/services/member_profile.py` — Simplify merge logic
- `services/core-api/app/services/legacy.py` — Handle gender in create_legacy
- `services/core-api/tests/test_member_profile_model.py` — Update for nicknames
- `services/core-api/tests/test_member_profile_service.py` — Update for nicknames + custom types
- `services/core-api/tests/test_member_profile_routes.py` — Update for nicknames + custom types

### Modified (Frontend)
- `apps/web/src/features/members/api/memberProfile.ts` — New types + display utilities
- `apps/web/src/features/legacy/api/legacies.ts` — Add gender to CreateLegacyInput
- `apps/web/src/features/legacy/components/ProfileHeader.tsx` — Add relationship summary
- `apps/web/src/features/legacy/components/LegacyProfile.tsx` — Pass profile to header, remove MyRelationshipSection
- `apps/web/src/features/legacy/components/LegacyEdit.tsx` — Add relationship section
- `apps/web/src/features/legacy/components/LegacyCreation.tsx` — Add gender + relationship section

### Deleted
- `apps/web/src/features/members/components/MyRelationshipSection.tsx`
