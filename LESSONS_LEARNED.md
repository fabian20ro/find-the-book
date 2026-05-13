# Lessons Learned

> Maintained by AI agents. Contains validated, reusable insights.
> **Read at the start of every task. Update at the end of every iteration.**

## How to Use This File

### Reading (Start of Every Task)
Read this before writing any code to avoid repeating known mistakes.

### Writing (End of Every Iteration)
If a new reusable insight was gained, add it to the appropriate category.

### Promotion from Iteration Log
Patterns appearing 2+ times in `ITERATION_LOG.md` should be promoted here.

### Pruning
Obsolete lessons → Archive section at bottom (with date and reason). Never delete.

---

## Architecture & Design Decisions

<!-- Format: **[YYYY-MM-DD]** Brief title — Explanation -->

## Code Patterns & Pitfalls

<!-- Format: **[YYYY-MM-DD]** Brief title — Explanation -->

**[2026-05-12] Quote CSV fields that contain carriage returns** — CSV escaping should treat `\r` as a quoting trigger alongside commas, quotes, and `\n`; otherwise a field can break line structure in spreadsheet imports even when the visible content looks fine.

**[2026-05-11] Normalize stored preference maps before using them** — Treat localStorage/sessionStorage maps as untrusted. Parse to `unknown`, keep only finite numeric counts, and drop malformed entries so one bad value does not corrupt counters or ordering.

**[2026-05-11] Reject blank required fields during restore** — When rehydrating stored entities, validate required string fields are non-empty after trimming. Empty ids/titles behave like corrupted records and should be skipped rather than restored.

**[2026-05-11] Filter preference-map keys against the supported option list** — When persisted ordering data is tied to a finite choice set, discard unknown keys during restore so stale or injected values cannot influence UI ordering or visibility.

**[2026-05-08] Validate serialized storage before restoring state** — Treat localStorage/sessionStorage payloads as untrusted. Parse to `unknown`, normalize each record, and skip malformed entries so one bad object does not block restoring the rest.

## Testing & Quality

<!-- Format: **[YYYY-MM-DD]** Brief title — Explanation -->

**[2026-05-13] Bound restored numeric book fields before rehydration** — When reading saved books from localStorage, treat `pageCount` as a positive integer and clamp `confidence` to the 0–100 range instead of trusting any finite number. Finite-but-invalid persisted values can still be semantically broken.
**[2026-05-13] Trim restored optional author names** — When normalizing stored book arrays, trim string author entries and drop blanks after trimming. Otherwise old localStorage payloads can preserve whitespace-only names that leak into the UI.

**[2026-05-13] Trim restored ISBN values** — When restoring saved books, trim string ISBNs and drop blank results before rehydration. Whitespace-only ISBNs otherwise survive storage restore and leak into filter/export/display surfaces.

**[2026-05-13] Trim restored optional metadata strings** — When rehydrating saved books, apply the same trim-and-drop cleanup to optional string metadata fields such as publisher, publishedDate, description, thumbnailUrl, and infoLink. Storage corruption often leaves padding around these values, and the UI should not replay it verbatim.

**[2026-05-12] Prefer focused Vitest over noisy helper typecheck when the repo's TS libs are misaligned** — If an automated patch or helper step emits broad `ReadonlyMap`/`WeakSet`/module-resolution errors from dependencies, but the targeted Vitest file passes, treat the Vitest run as the meaningful verification signal instead of widening scope to fix repo-wide TS config during a small change.

## Performance & Infrastructure

<!-- Format: **[YYYY-MM-DD]** Brief title — Explanation -->

## Dependencies & External Services

<!-- Format: **[YYYY-MM-DD]** Brief title — Explanation -->

## Process & Workflow

<!-- Format: **[YYYY-MM-DD]** Brief title — Explanation -->

---

## Archive

<!-- Format: **[YYYY-MM-DD] Archived [YYYY-MM-DD]** Title — Reason for archival -->
