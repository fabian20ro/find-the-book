# Iteration Log

> Append-only journal of AI agent work sessions.
> **Add an entry at the end of every iteration.**
> Same issue 2+ times? Promote to `LESSONS_LEARNED.md`.

## Entry Format

---

### [YYYY-MM-DD] Brief Description

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

<!-- New entries above this line, most recent first -->
