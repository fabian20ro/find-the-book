import type { CameraManager } from './camera';
import type { TextRecognizer } from './ocr';
import type { BookSearcher } from './books';
import { addBook, update, toast, getState } from './state';

const SCAN_INTERVAL_MS = 1000;
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
    scheduleNext(camera, ocr, bookSearcher);

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

function scheduleNext(
    camera: CameraManager,
    ocr: TextRecognizer,
    bookSearcher: BookSearcher,
): void {
    if (!getState().isScanning) return;
    scanTimer = setTimeout(() => scanFrame(camera, ocr, bookSearcher), SCAN_INTERVAL_MS);
}

async function scanFrame(
    camera: CameraManager,
    ocr: TextRecognizer,
    bookSearcher: BookSearcher,
): Promise<void> {
    if (!getState().isScanning || isPaused) {
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

        for (const text of textBlocks) {
            update({ lastDetectedText: text });
            const newBooks = await bookSearcher.search(text);
            for (const book of newBooks) {
                const added = addBook(book);
                if (added) toast(`Found: ${book.title}`);
            }
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
        scheduleNext(camera, ocr, bookSearcher);
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
