[![Deploy to GitHub Pages](https://github.com/fabian20ro/find-the-book/actions/workflows/deploy.yml/badge.svg)](https://github.com/fabian20ro/find-the-book/actions/workflows/deploy.yml)

**Live site:** [https://fabian20ro.github.io/find-the-book/](https://fabian20ro.github.io/find-the-book/)

# Find The Book

A Progressive Web App for fast book scanning. Point your camera at a bookshelf and the app
continuously identifies books by reading spine/cover text via in-browser OCR, then matching
against the Google Books database.

**No install required** — runs directly in Chrome. Can be added to your home screen as a PWA.

## How It Works

1. **Camera** — WebRTC `getUserMedia` captures the back camera feed continuously
2. **OCR** — Tesseract.js (WebAssembly, loaded from CDN) extracts text from each frame (~1 fps)
3. **Search** — Extracted text blocks are queried in parallel against Google Books API (free, no API key)
4. **Display** — Matched books appear in a scrollable popup sorted by confidence, with cover, title, author, and ISBN

## Features

- Real-time continuous scanning with auto-scan toggle (pause/resume)
- Manual single-scan and image upload modes
- OCR language selection — 16 languages with flag buttons, usage-based ordering, persisted preference
- Book candidates sorted by confidence score (highest first)
- Search filter in candidate popup — filter by title, author, or ISBN
- Auto-deduplication (same book won't appear twice)
- Export found books to CSV download
- Remove individual books from the list
- In-browser OCR via WebAssembly (no server, no cloud costs)
- PWA support (installable, works offline after first load)

## Tech Stack

| Component | Technology | Cost |
|-----------|-----------|------|
| Language | TypeScript | Free |
| Build | Vite | Free |
| Test | Vitest + jsdom | Free |
| OCR | Tesseract.js (CDN, browser WASM) | Free, on-device |
| Book Search | Google Books API | Free, no API key, 1000 req/day |
| Camera | WebRTC getUserMedia | Free, built-in |
| Hosting | GitHub Pages | Free |
| PWA | manifest.json + Service Worker | Free |

**Total cost: $0/month.** No server, no cloud functions, no API keys.

## Project Structure

```
find-the-book/
├── index.html              # Single-page app entry point
├── package.json            # Dependencies & scripts
├── tsconfig.json           # TypeScript configuration
├── vite.config.ts          # Vite build config
├── public/
│   ├── manifest.json       # PWA manifest
│   ├── sw.js               # Service Worker (plain JS, not processed by Vite)
│   └── icons/              # PWA icons (192x192, 512x512)
└── src/
    ├── app.ts              # Main app controller, language persistence, init
    ├── camera.ts           # Camera access via getUserMedia
    ├── ocr.ts              # Tesseract.js OCR wrapper with language switching
    ├── scanner.ts          # Scan loop, parallel text block search
    ├── books.ts            # Google Books API client with dedup & caching
    ├── state.ts            # Reactive state container with event emitter
    ├── ui.ts               # DOM rendering, language selector, candidate filter
    ├── dom.ts              # DOM element references
    ├── export.ts           # CSV export via Blob download
    ├── style.css           # Full-screen camera + overlay styles
    ├── tesseract.d.ts      # Type declarations for Tesseract CDN global
    └── *.test.ts           # Co-located unit tests (Vitest)
```

## Development

```bash
npm install          # Install dependencies
npm run dev          # Start dev server with hot reload
npm run build        # Type-check (tsc) + production build
npm run test         # Run tests once
npm run test:watch   # Run tests in watch mode
```

## Usage

1. Open the app URL in Chrome on your phone
2. Grant camera permission when prompted
3. Wait for OCR engine to initialize (first load downloads language data ~2-4MB)
4. Select your book language using the flag buttons at the bottom
5. Point camera at book spines or covers — auto-scan runs continuously
6. Found books appear in a popup sorted by confidence; use the search bar to filter
7. Add books to your list, export to CSV, or clear

## Performance Notes

- Text blocks are searched in parallel against Google Books API, minimizing scan-to-result latency
- Tesseract.js OCR takes ~1-3 seconds per frame; the scan interval naturally accommodates this
- First load downloads Tesseract WASM + language data (~2-6MB depending on language); cached by the service worker
- Best results with good lighting and clear book spines
- Optimized for back camera on mobile devices (uses `facingMode: 'environment'`)
