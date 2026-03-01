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

<!-- New entries above this line, most recent first -->
