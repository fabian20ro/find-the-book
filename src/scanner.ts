import type { CameraManager } from './camera';
import type { TextRecognizer } from './ocr';
import type { BookSearcher } from './books';
import { addCandidates, update, toast, getState } from './state';

const SCAN_INTERVAL_MS = 2000;
const OCR_TIMEOUT_MS = 10_000;

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

        const textBlocks = await withTimeout(
            ocr.recognize(canvas),
            OCR_TIMEOUT_MS,
            'OCR timed out',
        );

        update({ scanCount: getState().scanCount + 1 });

        const allNewBooks: import('./books').Book[] = [];
        for (const text of textBlocks) {
            update({ lastDetectedText: text });
            const newBooks = await bookSearcher.search(text);
            allNewBooks.push(...newBooks);
        }

        if (textBlocks.length === 0) {
            toast('No text detected');
        } else if (allNewBooks.length === 0) {
            toast('No new books found');
        } else {
            addCandidates(allNewBooks);
        }
    } catch (err) {
        console.error('Scan once error:', err);
        const message = err instanceof Error ? err.message : 'Scan error';
        if (message === 'OCR timed out') {
            toast('OCR timed out. Try again.');
            ocr.resetProcessing();
        }
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
    if (!getState().isScanning || isPaused || !getState().autoScan) {
        scheduleNext(camera, ocr, bookSearcher);
        return;
    }

    try {
        const canvas = camera.captureFrame();
        if (!canvas) {
            scheduleNext(camera, ocr, bookSearcher);
            return;
        }

        // OCR with timeout
        const textBlocks = await withTimeout(
            ocr.recognize(canvas),
            OCR_TIMEOUT_MS,
            'OCR timed out',
        );

        update({ scanCount: getState().scanCount + 1 });

        const allNewBooks: import('./books').Book[] = [];
        for (const text of textBlocks) {
            update({ lastDetectedText: text });
            const newBooks = await bookSearcher.search(text);
            allNewBooks.push(...newBooks);
        }
        if (allNewBooks.length > 0) {
            addCandidates(allNewBooks);
        }
    } catch (err) {
        console.error('Scan frame error:', err);
        const message = err instanceof Error ? err.message : 'Scan error';
        if (message === 'OCR timed out') {
            toast('OCR is taking too long. Retrying...');
            ocr.resetProcessing();
        }
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

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(message)), ms);
        promise.then(
            (v) => { clearTimeout(timer); resolve(v); },
            (e) => { clearTimeout(timer); reject(e); },
        );
    });
}
