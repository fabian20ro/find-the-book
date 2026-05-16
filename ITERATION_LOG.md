# Iteration Log

> Append-only journal of AI agent work sessions.
> **Add an entry at the end of every iteration.**
> Same issue 2+ times? Promote to `LESSONS_LEARNED.md`.

## Entry Format

---

### [2026-05-11] Filter stored OCR language usage to supported codes

**Context:** Prevent stale or injected OCR language counters from affecting the language selector order.
**What happened:**
- Added a supported-language whitelist in `normalizeLanguageUsage()` so `ftb-lang-usage` only keeps known OCR codes
- Added a regression test that confirms unknown usage keys are dropped alongside invalid counts
- Verified the updated app test file with `npm exec vitest run --no-typecheck src/app.test.ts`
**Outcome:** Success — language usage restore is now bounded to the current option catalog
**Insight:** Persisted preference maps should be normalized against both value shape and the current supported key set; numeric validity alone is not enough.
**Promoted to Lessons Learned:** Yes

---

### [2026-05-11] Harden saved book restore

**Context:** Make the stored-book restore path ignore malformed required fields and non-finite numeric values.
**What happened:**
- Tightened `normalizeStoredBook()` in `src/app.ts` to skip blank ids/titles and reject non-finite numeric fields
- Added app tests covering blank required fields and `1e999`/`-1e999` numeric payloads in stored JSON
- Ran the focused `src/app.test.ts` Vitest file successfully
**Outcome:** Success — restore path now drops corrupted stored books instead of reviving them
**Insight:** Storage validation should reject both malformed shapes and semantically blank required fields; a string is not automatically a usable id/title.
**Promoted to Lessons Learned:** Yes

---

### [2026-05-11] Normalize saved language usage data

**Context:** Make the language-usage preference store resilient to malformed localStorage payloads.
**What happened:**
- Added `normalizeLanguageUsage()` in `src/app.ts` to parse stored usage data defensively
- `getLanguageUsage()` now drops non-object payloads, non-numeric counts, and zero/negative values
- Added app tests covering malformed JSON and invalid usage entries
- Ran the focused app test file and the full Vitest suite successfully
**Outcome:** Success — language usage ordering is now robust against bad storage values
**Insight:** Preference maps deserve the same defensive treatment as restored entity lists; a single bad value should not poison the whole map.
**Promoted to Lessons Learned:** Yes

---

### [2026-05-08] Harden saved book restore

**Context:** Improve startup resilience when restoring saved books from localStorage.
**What happened:**
- Added `parseStoredBooks()` in `src/app.ts` to parse `ftb-books` defensively
- Normalizes stored book records and skips malformed entries instead of failing the entire restore
- Added an app test that verifies only well-formed saved books survive the restore pass
- Ran the full Vitest suite and production build successfully after installing dependencies locally
**Outcome:** Success — restore path is safer, tests pass, build passes
**Insight:** Persistent client storage should be treated as untrusted input; a small normalizer preserves good data even when one stored record is corrupted.
**Promoted to Lessons Learned:** Yes

---

**Context:** What was the goal
**What happened:** Key actions, decisions
**Outcome:** Success / partial / failure
**Insight:** (optional) What would you tell the next agent?
**Promoted to Lessons Learned:** Yes / No

---

### [2026-03-01] Redesign UI: home-first flow, auto-scan toggle, image upload

**Context:** User wanted three UX improvements: (1) app should start on a home screen showing found books, not immediately launching camera, (2) the 1-second auto-scan should be disableable with a manual tap-to-scan alternative, (3) ability to scan from a local image file.

**What happened:**
- Added `view`, `autoScan`, `isProcessingImage`, `ocrReady` fields to AppState
- Restructured index.html into two views: home view (book list + action buttons) and scan view (camera + controls)
- Added auto-scan toggle switch with `role="switch"` and tap-to-scan shutter button in scan view
- Added image upload via hidden file input, processing with canvas + Tesseract OCR
- OCR preloads in background on app start so scanning is instant when requested
- Auto-scan preference persisted to localStorage
- Rewrote app.ts init flow: load books → show home → preload OCR (background)
- Added `scanOnce()`, `resumeAutoScan()`, `pauseAutoScan()` to scanner.ts
- Full CSS rewrite: home view is scrollable dark page, scan view is fixed camera overlay

**Outcome:** Success — build passes cleanly, all TypeScript compiles without errors

**Insight:** When restructuring from a single-view to multi-view vanilla TS app, the view switching is cleanest when done via hidden attributes in renderUI() rather than adding/removing DOM nodes. The state model drives everything.

**Promoted to Lessons Learned:** No

---

### [2026-03-01] Refactor codebase for maintainability

**Context:** User requested code refactoring for maintainability after several features were added (book selection popup, auto-scan pause, confidence scoring).

**What happened:**
- Fixed inline type imports (`import('./books').Book[]`) in scanner.ts and ui.ts — replaced with proper top-level imports
- Extracted magic constants in ui.ts: `MAX_DISPLAY_TEXT_LENGTH`, `TOAST_DISPLAY_MS`, `TOAST_CLEANUP_FALLBACK_MS`, `CONFIDENCE_HIGH_THRESHOLD`, `CONFIDENCE_MID_THRESHOLD`, `NO_COVER_SVG`
- Extracted shared helpers in ui.ts: `renderBookImage()`, `renderBookMeta()`, `confidenceClass()` — eliminated SVG fallback duplication and simplified renderCandidateList
- Simplified `ocrStatus.hidden` assignment (was unnecessarily verbose if/else)
- Extracted `searchTextBlocks()` in scanner.ts to deduplicate text-block-to-books loop used in scanOnce, scanFrame, and app.ts handleImageUpload (3 copies → 1 exported function)
- Extracted `handleScanError()` in scanner.ts to unify error handling between scanOnce and scanFrame
- Decoupled books.ts from state.ts: removed `toast` import, added `notify` callback parameter to BookSearcher constructor (dependency injection)
- Removed unnecessary `vi.mock('./state')` from books.test.ts (no longer needed)

**Outcome:** Success — all 151 tests pass, TypeScript compiles cleanly, no behavioral changes

**Insight:** When decoupling modules, constructor-injected callbacks are the simplest pattern for notification side-effects. Default no-op parameter keeps tests simple while production code passes the real implementation.

**Promoted to Lessons Learned:** No

---

### [2026-03-02] Create OCR Expert sub-agent

**Context:** Project needed a specialized agent for OCR quality, Tesseract.js tuning, and text extraction pipeline work — a recurring task domain with dedicated modules (ocr.ts, scanner.ts).

**What happened:**
- Explored OCR codebase: ocr.ts (TextRecognizer, preprocessCanvas), scanner.ts (scanOnce, scanFrame, searchTextBlocks), type definitions, app.ts integration
- Created `.claude/agents/ocr-expert.md` following Agent Creator template and validation checklist
- Agent covers 2 modules (ocr.ts, scanner.ts) with output templates for preprocessing changes and recognition tuning
- Includes key module knowledge section with project-specific constants and constraints
- 5 actionable principles based on actual codebase patterns (scan interval, contrast stretch, line thresholds, worker recycling, debugging advice)
- Registered in AGENTS.md Sub-Agents table

**Outcome:** Success — agent file created, under 100 lines, focused scope, registered

**Insight:** When creating an OCR-focused agent, the most valuable content is project-specific constants and tuning thresholds (min line length, scan interval, timeout) that aren't discoverable from generic Tesseract docs.

**Promoted to Lessons Learned:** No

---

### [2026-05-12] Cover visible language ranking in UI tests

**Context:** Add regression coverage for the language selector's visible-language ranking so the top-6 ordering stays intentional.
**What happened:**
- Added a UI test that exercises `getVisibleLanguages()` with a descending usage map and asserts the visible set is capped at six entries in usage order
- Verified the focused UI test file with `npm test -- src/ui.test.ts`
- The helper auto-lint step emitted broad TypeScript lib/module-resolution noise, but the Vitest run itself passed cleanly
**Outcome:** Success — the visible-language ordering contract now has explicit regression coverage
**Insight:** For this repo, a focused Vitest run is the signal that matters when helper-triggered typecheck noise comes from pre-existing tsconfig/lib friction
**Promoted to Lessons Learned:** Yes

---

### [2026-05-12] Harden CSV export for carriage returns

**Context:** Prevent CSV exports from producing broken rows when a field contains a bare carriage return.
**What happened:**
- Updated `escapeCsv()` in `src/export.ts` to quote fields containing `\r` in addition to commas, quotes, and line feeds
- Added a regression test that exports a title containing `\r` and asserts the serialized CSV keeps the field quoted
- Verified the focused `src/export.test.ts` Vitest file successfully
- A direct `tsc --noEmit` check still reports pre-existing `process` type errors in `src/ocr.ts`
**Outcome:** Success — CSV export now preserves carriage-return fields safely
**Insight:** CSV escaping should consider carriage returns as line-structure characters, not just newline bytes; spreadsheet imports can split rows on `\r` even when `\n` is absent.
**Promoted to Lessons Learned:** Yes

### [2026-05-13] Bound restored numeric book fields before rehydration

**Context:** Tighten the localStorage restore path so invalid persisted numeric book fields cannot come back into state with semantically broken values.
**What happened:**
- Updated `normalizeStoredBook()` in `src/app.ts` to require positive integer `pageCount` values during restore
- Clamped restored `confidence` values to the 0–100 range instead of trusting any finite number
- Replaced the app restore regression test with a case that exercises a negative `pageCount` and an out-of-range confidence value
- Verified the focused `src/app.test.ts` Vitest file successfully
- Ran a direct TypeScript no-emit check; it still reports pre-existing `process` type errors in `src/ocr.ts`
**Outcome:** Success — restored books now reject invalid numeric metadata instead of replaying it verbatim
**Insight:** Persisted numeric fields need semantic bounds as well as finite checks; "finite" alone still allows corrupt-but-non-crashing data back into state
**Promoted to Lessons Learned:** Yes

---

### [2026-05-13] Trim restored author names during book rehydration

**Context:** Keep old localStorage book entries from carrying whitespace-only or padded author names into the UI.
**What happened:**
- Updated `normalizeStoredBook()` in `src/app.ts` to trim author strings and drop blank entries during restore
- Added an app regression test that verifies padded and blank authors normalize to a clean author list
- Verified the focused `src/app.test.ts` Vitest file and the full Vitest suite successfully
**Outcome:** Success — restored books now keep author metadata clean instead of replaying storage whitespace
**Insight:** Optional array fields deserve the same cleanup pass as required scalars; whitespace-only entries are still junk even when the parent record is valid
**Promoted to Lessons Learned:** Yes

---

### [2026-05-13] Trim restored ISBN values during book rehydration

**Context:** Prevent whitespace-only ISBN strings from surviving localStorage restore and leaking into the UI/export surfaces.
**What happened:**
- Updated `normalizeStoredBook()` in `src/app.ts` to trim restored ISBN strings and drop blank results
- Added an app regression test that checks trimmed ISBN restore and blank ISBN normalization
- Verified the focused `src/app.test.ts` Vitest file successfully
**Outcome:** Success — restored ISBN data now comes back clean instead of preserving storage whitespace
**Insight:** Optional scalar fields should get the same trim-and-drop treatment as authors when their user-facing surfaces treat blank values as absent
**Promoted to Lessons Learned:** Yes

---

### [2026-05-13] Trim restored optional metadata fields during book rehydration

**Context:** Prevent padded or blank optional metadata from surviving localStorage restore and leaking into the UI.
**What happened:**
- Updated `normalizeStoredBook()` in `src/app.ts` to trim optional metadata strings for publisher, publishedDate, description, thumbnailUrl, infoLink, and isbn
- Added a regression test that verifies trimmed values are restored and blank optional metadata drops to `null`
- Added a reusable lesson so future storage restore work keeps applying the same cleanup pattern across optional string fields
**Outcome:** Success — restored book metadata now comes back normalized instead of replaying storage whitespace
**Insight:** If a storage restore path already trims authors and ISBNs, other optional string metadata should follow the same contract unless there is a documented exception
**Promoted to Lessons Learned:** Yes

---

### [2026-05-13] Trim restored required book ids and titles during rehydration

**Context:** Keep stored book ids and titles from re-entering state with leading/trailing whitespace.
**What happened:**
- Updated `normalizeStoredBook()` in `src/app.ts` to trim required `id` and `title` fields before accepting a restored book
- Added a regression test that verifies padded required fields normalize to clean values
- Added a reusable lesson so future restore work remembers to normalize required book identifiers, not just optional metadata
**Outcome:** Success — restored books now normalize core identifiers instead of preserving storage padding
**Insight:** Required fields can be technically non-empty and still be semantically dirty; restore paths should trim before validation so ids and titles stay canonical
**Promoted to Lessons Learned:** Yes

---

### [2026-05-14] Make query matching accent-aware

**Context:** Improve search confidence scoring for books with accented titles and authors.
**What happened:**
- Updated `queryMatchRatio()` in `src/books.ts` to normalize text with Unicode-aware matching before stripping punctuation
- Added a regression test proving `Café Society` matches a plain ASCII query after normalization
- Recorded the Unicode-aware matching rule in `LESSONS_LEARNED.md` for future search work
- Verified the full Vitest suite (`npm test`) successfully
**Outcome:** Success — query scoring now treats accented titles more like users expect
**Insight:** ASCII-only `\w` cleanup can under-score languages that the app already claims to support; normalize first, then compare on Unicode letters and numbers
**Promoted to Lessons Learned:** Yes

---


### [2026-05-14] Keep restored OCR language preferences bounded to supported codes

**Context:** Prevent stale or injected OCR language preferences from changing the scanner to an unsupported language.
**What happened:**
- Simplified `loadLanguagePref()` in `src/app.ts` to validate persisted language codes against the cached supported-language set
- Added a regression test that proves unsupported saved OCR languages are ignored and the default language remains active
- Ran the focused app test file and the full Vitest suite successfully
**Outcome:** Success — language restore now shares the same supported-code contract as the language usage store
**Insight:** Persisted config should be checked against the same bounded option set the UI exposes; a cached contract surface is easier to keep in sync than a fresh scan on every restore
**Promoted to Lessons Learned:** Yes

---

### [2026-05-15] Preserve the OCR worker across failed language switches

**Context:** Prevent a failed OCR language change from leaving the recognizer without a usable worker.
**What happened:**
- Reworked `TextRecognizer.setLanguage()` in `src/ocr.ts` so the current worker is only terminated after the replacement worker is created and whitelisted successfully
- Added a regression test proving a failed language switch keeps the previous worker usable for subsequent OCR calls
- Ran focused verification with `npm test -- --run src/ocr.test.ts src/app.test.ts`
**Outcome:** Success — OCR language switching now fails safely instead of dropping the existing worker
**Insight:** Stateful swaps should keep the old instance alive until the replacement is fully ready; otherwise a partial failure can convert a recoverable config change into a hard stop
**Promoted to Lessons Learned:** Yes

---

### [2026-05-15] Sync README with fail-safe OCR language switching

**Context:** Keep the top-level feature list and performance notes aligned with the current OCR language-switch behavior.
**What happened:**
- Updated `README.md` to note that OCR language selection now switches fail-safely and keeps scanning on a failed language download
- Appended this iteration to the append-only log to preserve the project learning workflow
**Outcome:** Success — user-facing docs now reflect the current recoverable language-switch behavior
**Insight:** When a small reliability fix changes user-visible behavior, the README should say so near the feature it affects instead of leaving the behavior buried in tests or lessons
**Promoted to Lessons Learned:** No

---

### [2026-05-15] Document book-list sharing in the README

**Context:** The app already exposes a share action for the saved book list, but the top-level README only mentioned CSV export.
**What happened:**
- Updated the feature list to mention native share-sheet support with clipboard fallback
- Updated the usage section to tell readers they can share or export saved books
- Kept the append-only iteration log current with this docs sync
**Outcome:** Success — the README now surfaces an existing user-facing action that was previously easy to miss
**Insight:** If a button is visible in the UI but missing from the README feature list, that is a discoverability gap worth closing even when no code changes are needed
**Promoted to Lessons Learned:** No

---

### [2026-05-16] Document the OCR language picker overflow in the README

**Context:** The language selector already exposes a visible `More languages` expander, but the top-level README only described the flag buttons and ordering.
**What happened:**
- Updated the README feature list to mention the `More languages` expander alongside the flag buttons
- Kept the append-only iteration log current with the docs sync
**Outcome:** Success — the README now matches the shipped language-picker affordance more closely
**Insight:** When a control has a visible overflow path, the user-facing docs should name it explicitly so the affordance is discoverable without source spelunking
**Promoted to Lessons Learned:** No

---

### [2026-05-16] Document the manual scan button label in the README

**Context:** The UI already shows a `Capture and scan` button when auto-scan is off, but the README only said the app supports manual single-scan mode.
**What happened:**
- Updated the README feature list to name the `Capture and scan` affordance explicitly
- Kept the append-only iteration log current with the docs sync
**Outcome:** Success — the manual-scan fallback is now discoverable by its shipped label
**Insight:** When a control only appears in a specific mode, docs should name both the mode and the exact label so readers can find it quickly
**Promoted to Lessons Learned:** No

---
