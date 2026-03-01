# Find The Book

A Progressive Web App for fast book scanning. Point your camera at a bookshelf and the app
continuously identifies books by reading spine/cover text via in-browser OCR, then matching
against the Google Books database.

**No install required** — runs directly in Chrome. Can be added to your home screen as a PWA.

## How It Works

1. **Camera** — WebRTC `getUserMedia` captures the back camera feed continuously
2. **OCR** — Tesseract.js (WebAssembly) extracts text from each frame (~1 fps)
3. **Search** — Extracted text is queried against Google Books API (free, no API key)
4. **Display** — Matched books appear in a scrollable overlay with cover, title, author, and ISBN

## Features

- Real-time continuous scanning (pause/resume)
- Auto-deduplication (same book won't appear twice)
- Export found books to CSV download
- Remove individual books from the list
- In-browser OCR via WebAssembly (no server, no cloud costs)
- PWA support (installable, works offline after first load)

## Tech Stack

| Component | Technology | Cost |
|-----------|-----------|------|
| OCR | Tesseract.js (browser WASM) | Free, on-device |
| Book Search | Google Books API | Free, no API key, 1000 req/day |
| Camera | WebRTC getUserMedia | Free, built-in |
| Hosting | GitHub Pages | Free |
| Framework | Vanilla HTML/CSS/JS | Free, no build step |
| PWA | manifest.json + Service Worker | Free |

**Total cost: $0/month.** No server, no cloud functions, no API keys.

## Project Structure

```
find-the-book/
├── index.html          # Single-page app entry point
├── manifest.json       # PWA manifest
├── sw.js               # Service Worker for offline caching
├── css/
│   └── style.css       # Full-screen camera + overlay styles
├── js/
│   ├── app.js          # Main app controller + state management
│   ├── camera.js       # Camera access via getUserMedia
│   ├── ocr.js          # Tesseract.js OCR wrapper
│   ├── books.js        # Google Books API client with dedup
│   └── export.js       # CSV export via Blob download
└── icons/
    ├── icon-192.png    # PWA icon 192x192
    └── icon-512.png    # PWA icon 512x512
```

## Usage

1. Open the app URL in Chrome on your phone
2. Grant camera permission when prompted
3. Wait for OCR engine to initialize (first load downloads ~4MB)
4. Point camera at book spines or covers
5. Found books appear in the bottom overlay
6. Use controls to pause/resume, export CSV, or clear the list

## Hosting on GitHub Pages

1. Go to repo **Settings > Pages**
2. Set source to **Deploy from a branch**
3. Select **main** branch, **/ (root)** folder
4. App will be live at `https://<username>.github.io/find-the-book/`

## Performance Notes

- Tesseract.js OCR takes ~1-3 seconds per frame (vs ~200ms for native ML Kit). The 1fps scan interval naturally accommodates this.
- First load downloads Tesseract WASM + English language data (~4-6MB total). Cached by the service worker after that.
- Best results with good lighting and clear book spines.
- Optimized for back camera on mobile devices (uses `facingMode: 'environment'`).
