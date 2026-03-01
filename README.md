# Find The Book

An Android app for fast library book scanning. Point your camera at a bookshelf and the app
continuously identifies books by reading spine/cover text via on-device OCR, then matching
against the Google Books database.

## How It Works

1. **Camera** - CameraX captures frames continuously (~1 fps throttled)
2. **OCR** - Google ML Kit Text Recognition (on-device, free) extracts text from each frame
3. **Search** - Extracted text is queried against Google Books API (free, no API key needed)
4. **Display** - Matched books appear in a scrollable overlay with cover image, title, author, and ISBN

## Features

- Real-time continuous scanning (pause/resume)
- Auto-deduplication (same book won't appear twice)
- Export found books to CSV via share sheet
- Remove individual books from the list
- On-device OCR (no cloud costs, works offline for text extraction)

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Language | Kotlin |
| UI | Jetpack Compose + Material 3 |
| Camera | CameraX (ImageAnalysis) |
| OCR | Google ML Kit Text Recognition v2 |
| Book API | Google Books API (free) |
| DI | Hilt |
| Networking | Retrofit + OkHttp |
| Images | Coil |

## Project Structure

```
app/src/main/java/com/findbookscanner/
├── FindTheBookApp.kt          # Hilt Application
├── MainActivity.kt            # Entry point
├── camera/
│   └── FrameAnalyzer.kt       # CameraX frame analysis with throttling
├── ocr/
│   └── TextRecognitionProcessor.kt  # ML Kit text recognition wrapper
├── books/
│   ├── GoogleBooksApi.kt       # Retrofit API interface + response models
│   └── GoogleBooksRepository.kt # Book search with caching
├── data/
│   └── Book.kt                 # Book data model
├── di/
│   └── AppModule.kt            # Hilt dependency injection
└── ui/
    ├── CameraScreen.kt         # Camera preview + permission handling
    ├── BookListOverlay.kt       # Bottom overlay with found books
    └── BookScannerViewModel.kt  # State management + business logic
```

## Building

Open in Android Studio and build, or from the command line:

```bash
./gradlew assembleDebug
```

## Requirements

- Android SDK 26+ (Android 8.0)
- Target SDK 35
- Device with camera (optimized for Pixel 9a)

## Cost

**Completely free.** ML Kit runs on-device (no cloud billing) and Google Books API requires
no API key for basic volume searches.
