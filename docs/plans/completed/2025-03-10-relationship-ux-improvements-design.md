# Relationship UX Improvements — Design Doc

**Date:** 2025-03-10
**Status:** Approved
**Related:** `docs/plans/2025-02-13-member-relationship-profiles-design.md`

## Goal

Improve the UX of member relationship profiles by:
1. Converting the nickname field to a multi-value tag input (like character traits)
2. Making the relationship type a searchable combobox with gender-aware terms and custom entry
3. Moving relationship editing to the legacy edit and create pages
4. Displaying a compact relationship summary in the profile header on the detail page

## Design Decisions

### 1. Data Model — `nickname` becomes `nicknames`

- Pydantic schema: `nickname: str | None` → `nicknames: list[str] | None`
- JSONB profile field key changes from `nickname` to `nicknames`
- Max 10 nicknames, each max 100 characters (validated in Pydantic)
- No migration needed — JSONB is schemaless and no production data exists yet

### 2. Data Model — `relationship_type` allows custom values

- Change from `RelationshipType` enum to a `str` field with `max_length=50`
- Keep predefined values as a constant for frontend suggestions but do not enforce server-side
- This avoids schema changes for entries like "godmother" or "step-brother"

### 3. Reusable TagInput Component

Extract the current inline traits implementation into `apps/web/src/components/ui/tag-input.tsx`.

```typescript
interface TagInputProps {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  maxItems?: number;
  maxLength?: number; // per tag
}
```

Behavior:
- Type a value, press Enter or click Add to create a pill
- Pills display with X button to remove
- Prevents duplicates (case-insensitive)
- Shows count indicator when at max (e.g. "10/10")
- Used for both **nicknames** and **character traits** fields

### 4. Searchable Relationship Combobox

New component at `apps/web/src/components/ui/combobox.tsx`.

Behavior:
- Text input that filters a predefined relationship list as the user types
- Clicking the input without typing shows the full dropdown
- Fuzzy matching for common aliases (mom → Mother, dad → Father, bro → Brother, etc.)
- When no matches found, shows "Add '[typed value]' as custom relationship" option
- Selecting an option fills the field

#### Gender-Aware Relationship Terms

When the legacy subject has a gender set, the combobox list includes **both** the gendered term and the neutral term, with the gendered term listed first:

| Base Term    | Male          | Female        |
|-------------|---------------|---------------|
| Parent      | Father        | Mother        |
| Child       | Son           | Daughter      |
| Sibling     | Brother       | Sister        |
| Grandparent | Grandfather   | Grandmother   |
| Grandchild  | Grandson      | Granddaughter |
| Spouse      | Husband       | Wife          |

Example list when legacy gender is "female":

> Mother, Parent, Daughter, Child, Sister, Sibling, Grandmother, Grandparent, Granddaughter, Grandchild, Wife, Spouse, Aunt, Uncle, Cousin, Niece, Nephew, In-Law, Friend, Colleague, Mentor, Mentee, Caregiver, Neighbor, Other

Non-gendered relationship types (aunt, uncle, cousin, friend, etc.) and custom values display as-is regardless of gender.

If gender is not set, the list shows only neutral terms (Parent, Child, Sibling, etc.).

**Fuzzy search aliases** (used for matching only, not displayed in the list):

| Alias | Matches |
|-------|---------|
| mom, mum, mama | Mother |
| dad, papa, pop | Father |
| bro | Brother |
| sis | Sister |
| grandma, nana, nan | Grandmother |
| grandpa, gramps | Grandfather |
| hubby | Husband |

### 5. Detail Page — Profile Header Integration

**Remove** the standalone `MyRelationshipSection` component from between ProfileHeader and SectionNav.

**Add** a compact relationship summary line inside `ProfileHeader`, below the biography and above the stats row:

```
[Name]  [Public badge]
1985 – 2020
Biography text here...

Mother · "Mom", "Mama" · kind, resilient, funny       ← NEW LINE

📝 3 stories  👥 2 members  Created by John
```

#### Display Rules

- **Relationship label**: Use the gender-aware lookup table when the relationship type is one of the six gendered types and the legacy has a gender set. Otherwise display the raw value. Only shown if set.
- **Nicknames**: Quoted, comma-separated. Cap at 3 visible. If more exist, show "+N more" that expands inline.
- **Character traits**: Small pills. Cap at 5 visible. If more exist, show "+N more" that expands inline.
- Segments separated by `·` (middle dot). Only segments with values are shown.
- If nothing is set, show subtle text link: "Describe your relationship with [Name] →" that navigates to `/legacy/{id}/edit` with the relationship section open.
- The entire summary line is clickable and navigates to the edit page.

#### Gender-Aware Display Logic

A pure lookup function with no cascading conditionals:

```typescript
const GENDERED_LABELS: Record<string, Record<string, string>> = {
  parent:      { male: 'Father',        female: 'Mother' },
  child:       { male: 'Son',           female: 'Daughter' },
  sibling:     { male: 'Brother',       female: 'Sister' },
  grandparent: { male: 'Grandfather',   female: 'Grandmother' },
  grandchild:  { male: 'Grandson',      female: 'Granddaughter' },
  spouse:      { male: 'Husband',       female: 'Wife' },
};

function getRelationshipDisplayLabel(
  relationshipType: string,
  legacyGender: string | null
): string {
  const gendered = GENDERED_LABELS[relationshipType];
  if (gendered && legacyGender && gendered[legacyGender]) {
    return gendered[legacyGender];
  }
  // Fallback: capitalize and replace underscores
  return relationshipType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
```

### 6. Edit Page — Relationship Section

On `LegacyEdit.tsx`, add a collapsible section between the last form field (visibility) and the Save/Cancel buttons:

```
Name
Birth Date / Death Date
Biography
Gender
Visibility

▼ My Relationship (optional)
  Relationship       [searchable combobox]
  Nicknames           [tag input]
  Who they are to me  [textarea]
  Who I am to them    [textarea]
  Character traits    [tag input]

[Cancel]  [Save]
```

**Collapse behavior:**
- Starts **expanded** if the user has existing profile data
- Starts **collapsed** if empty (keeps the form minimal for first-time editors)

**Single save button:** On save, fires both the legacy update (`PUT /api/legacies/{id}`) and the profile update (`PUT /api/legacies/{id}/profile`) in parallel via `Promise.all`. If either fails, the error is shown. The relationship section sits above the buttons so expanding it pushes Save down naturally.

**Data loading:** The component fetches the member profile via the existing `useMemberProfile(legacyId)` hook and initializes form state from both the legacy data and the profile data.

### 7. Create Page — Relationship Section

Same collapsible section on `LegacyCreation.tsx`:
- **Always collapsed by default** with label "My Relationship (optional)"
- Gender dropdown also added to the creation form (same options as edit page)
- Relationship profile saved as a second API call after the legacy is created (needs the legacy ID first)

### 8. Files Summary

#### New
- `apps/web/src/components/ui/tag-input.tsx` — Reusable tag/chip input
- `apps/web/src/components/ui/combobox.tsx` — Searchable dropdown with custom entry

#### Modified (Backend)
- `services/core-api/app/schemas/member_profile.py` — `nickname` → `nicknames` (list), `relationship_type` → `str`
- `services/core-api/app/services/member_profile.py` — Update merge logic for list field
- `services/core-api/tests/test_member_profile_model.py` — Update test fixtures
- `services/core-api/tests/test_member_profile_service.py` — Update for nicknames
- `services/core-api/tests/test_member_profile_routes.py` — Update for nicknames

#### Modified (Frontend)
- `apps/web/src/features/members/api/memberProfile.ts` — Types updated, add gender-aware label utilities
- `apps/web/src/features/members/hooks/useMemberProfile.ts` — No changes expected
- `apps/web/src/features/legacy/components/ProfileHeader.tsx` — Add relationship summary line
- `apps/web/src/features/legacy/components/LegacyProfile.tsx` — Remove MyRelationshipSection import and usage
- `apps/web/src/features/legacy/components/LegacyEdit.tsx` — Add collapsible relationship section
- `apps/web/src/features/legacy/components/LegacyCreation.tsx` — Add gender dropdown + collapsible relationship section

#### Deleted
- `apps/web/src/features/members/components/MyRelationshipSection.tsx` — Replaced by ProfileHeader summary + edit page section
