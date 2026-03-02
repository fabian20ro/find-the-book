import type { CameraManager } from './camera';
import type { TextRecognizer, OcrLine } from './ocr';
import { frameBrightness } from './ocr';
import type { Book, BookSearcher } from './books';
import { addCandidates, update, toast, getState } from './state';

const SCAN_INTERVAL_MS = 2000;
const OCR_TIMEOUT_MS = 10_000;
const MIN_BRIGHTNESS = 40;
const SECONDARY_QUERY_MIN_LENGTH = 8;

let scanTimer: ReturnType<typeof setTimeout> | null = null;
let isPaused = false;
let visibilityHandler: (() => void) | null = null;

export function startScanning(
    camera: CameraManager,
    ocr: TextRecognizer,
    bookSearcher: BookSearcher,
): void {
    update({ isScanning: true });
    isPaused = false;

    // Only auto-schedule if autoScan is enabled
    if (getState().autoScan) {
        scheduleNext(camera, ocr, bookSearcher);
    }

    // Pause scanning when tab is hidden
    visibilityHandler = () => onVisibilityChange(camera, ocr, bookSearcher);
    document.addEventListener('visibilitychange', visibilityHandler);
}

export function stopScanning(): void {
    if (scanTimer) {
        clearTimeout(scanTimer);
        scanTimer = null;
    }
    if (visibilityHandler) {
        document.removeEventListener('visibilitychange', visibilityHandler);
        visibilityHandler = null;
    }
    isPaused = false;
    update({ isScanning: false });
}

/**
 * Single-shot scan: capture one frame, OCR it, search for books, done.
 * Used when auto-scan is disabled and user taps "Scan Now".
 */
export async function scanOnce(
    camera: CameraManager,
    ocr: TextRecognizer,
    bookSearcher: BookSearcher,
): Promise<void> {
    try {
        const canvas = camera.captureFrame();
        if (!canvas) {
            toast('Could not capture frame');
            return;
        }

        if (frameBrightness(canvas) < MIN_BRIGHTNESS) {
            toast('Scene too dark — try better lighting');
            return;
        }

        const ocrLines = await withTimeout(
            ocr.recognize(canvas),
            OCR_TIMEOUT_MS,
            'OCR timed out',
        );

        update({ scanCount: getState().scanCount + 1 });

        const allNewBooks = await searchTextBlocks(ocrLines, bookSearcher);

        if (ocrLines.length === 0) {
            toast('No text detected');
        } else if (allNewBooks.length === 0) {
            toast('No new books found');
        } else {
            addCandidates(allNewBooks);
        }
    } catch (err) {
        handleScanError(err, 'Scan once error:', ocr);
    }
}

/**
 * Called when autoScan is toggled on while scanning is active.
 * Resumes the auto-scan loop.
 */
export function resumeAutoScan(
    camera: CameraManager,
    ocr: TextRecognizer,
    bookSearcher: BookSearcher,
): void {
    if (getState().isScanning && getState().autoScan && !scanTimer) {
        scheduleNext(camera, ocr, bookSearcher);
    }
}

/**
 * Called when autoScan is toggled off. Stops the scheduled loop
 * but keeps isScanning true so the camera stays active.
 */
export function pauseAutoScan(): void {
    if (scanTimer) {
        clearTimeout(scanTimer);
        scanTimer = null;
    }
}

function scheduleNext(
    camera: CameraManager,
    ocr: TextRecognizer,
    bookSearcher: BookSearcher,
): void {
    if (!getState().isScanning || !getState().autoScan) return;
    scanTimer = setTimeout(() => scanFrame(camera, ocr, bookSearcher), SCAN_INTERVAL_MS);
}

async function scanFrame(
    camera: CameraManager,
    ocr: TextRecognizer,
    bookSearcher: BookSearcher,
): Promise<void> {
    if (!getState().isScanning || isPaused || !getState().autoScan || getState().candidateBooks.length > 0) {
        scheduleNext(camera, ocr, bookSearcher);
        return;
    }

    try {
        const canvas = camera.captureFrame();
        if (!canvas) {
            scheduleNext(camera, ocr, bookSearcher);
            return;
        }

        // Skip dark frames — avoids wasting OCR time on garbage input
        if (frameBrightness(canvas) < MIN_BRIGHTNESS) {
            scheduleNext(camera, ocr, bookSearcher);
            return;
        }

        // OCR with timeout
        const ocrLines = await withTimeout(
            ocr.recognize(canvas),
            OCR_TIMEOUT_MS,
            'OCR timed out',
        );

        update({ scanCount: getState().scanCount + 1 });

        const allNewBooks = await searchTextBlocks(ocrLines, bookSearcher);
        if (allNewBooks.length > 0) {
            addCandidates(allNewBooks);
        }
    } catch (err) {
        handleScanError(err, 'Scan frame error:', ocr);
    }

    // Always schedule next scan, even after errors
    scheduleNext(camera, ocr, bookSearcher);
}

function onVisibilityChange(
    camera: CameraManager,
    ocr: TextRecognizer,
    bookSearcher: BookSearcher,
): void {
    if (!getState().isScanning) return;
    if (document.hidden) {
        isPaused = true;
        if (scanTimer) {
            clearTimeout(scanTimer);
            scanTimer = null;
        }
    } else {
        isPaused = false;
        if (getState().autoScan) {
            scheduleNext(camera, ocr, bookSearcher);
        }
    }
}

export async function searchTextBlocks(ocrLines: OcrLine[], bookSearcher: BookSearcher): Promise<Book[]> {
    if (ocrLines.length === 0) return [];

    const texts = ocrLines.map((l) => l.text);
    update({ lastDetectedText: texts[0] });

    // Primary query: all lines joined — gives Google Books the full context
    const combined = texts.join(' ');

    // Secondary queries: individual lines long enough to be meaningful (>= 8 chars),
    // deduped and excluding lines that are identical to the combined query (single-line case)
    const longIndividuals = [...new Set(texts.filter((t) => t.length >= SECONDARY_QUERY_MIN_LENGTH && t !== combined))];

    const queries = [combined, ...longIndividuals];

    const results = await Promise.allSettled(
        queries.map((text) => bookSearcher.search(text)),
    );

    const allNewBooks: Book[] = [];
    for (const result of results) {
        if (result.status === 'fulfilled') {
            allNewBooks.push(...result.value);
        }
    }
    return allNewBooks;
}

function handleScanError(err: unknown, label: string, ocr: TextRecognizer): void {
    console.error(label, err);
    if (err instanceof Error && err.message === 'OCR timed out') {
        toast('OCR timed out — retrying on next scan.');
        ocr.resetProcessing();
    }
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(message)), ms);
        promise.then(
            (v) => { clearTimeout(timer); resolve(v); },
            (e) => { clearTimeout(timer); reject(e); },
        );
    });
}
