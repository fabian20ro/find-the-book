# Plan: Improve README Documentation Affordances

**Date:** 2026-05-22
**Goal:** Enhance the visibility of user-facing features and capabilities in the `README.md` to ensure developers and users understand what the application does without reading the source code, following the pattern established in `LESSONS_LEARNED.md`.

## Context
The project has a learning system that emphasizes documenting visible UI affordances. Currently, the `README.md` might be too sparse on feature descriptions.

## Implementation Units

### [Unit 0] Audit README content
- **Description:** Inspect `README.md` to identify where feature descriptions are missing or could be more explicit.
- **Tier:** Tier 0
- **Verification:** `cat README.md` check for presence of specific keywords (e.g., "features", "capabilities").

### [Unit 1] Add Features section to README
- **Description:** Explicitly list the following as core features:
  - Google Books API integration (no key required, 1rad/day limit).
  - OCR capabilities via Tesseract.js (loaded from CDN).
  - Local storage persistence for book collections and search preferences.
  - Service worker support for offline capabilities.
- **Tier:** Tier 1
- **Verification:** `grep -q "Features" README.md` and check content completeness.

### [Unit 2] Verification of implementation
- **Description:** Final check that the new section is properly formatted and doesn't break existing Markdown structure.
- **Tier:** Tier 2
- **Verification:** `markdownlint README.md` (if available) or manual structural check.

## Expected Files Changed
- `README.md`

## Risks
- None identified. Small, bounded change to documentation.
