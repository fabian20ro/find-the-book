import './style.css';
import { CameraManager } from './camera';
import { TextRecognizer } from './ocr';
import { BookSearcher } from './books';
import { exportToCsv } from './export';
import { getState, update, addBook, addCandidates, removeCandidateById, clearCandidates, clearBooks, removeBook, on, toast, type Book } from './state';
import { startScanning, stopScanning, scanOnce, resumeAutoScan, pauseAutoScan, searchTextBlocks } from './scanner';
import { initUI, getVideoElement, getCanvasElement, showError, hideError, getAllLanguages } from './ui';

// Core components
const bookSearcher = new BookSearcher(toast);
let cameraManager: CameraManager | null = null;
let textRecognizer: TextRecognizer;

// localStorage persistence
const STORAGE_KEY = 'ftb-books';
const AUTOSCAN_KEY = 'ftb-autoscan';
const LANG_KEY = 'ftb-language';
const LANG_USAGE_KEY = 'ftb-lang-usage';

function saveBooks(): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(getState().books));
    } catch {
        toast('Could not save books. Storage may be full.');
    }
}

function loadBooks(): void {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const books: Book[] = JSON.parse(stored);
            update({ books });
            for (const book of books) {
                bookSearcher.preloadBookId(book.id);
            }
        }
    } catch {
        toast('Could not restore previously saved books.');
    }
}

function loadAutoScanPref(): void {
    try {
        const stored = localStorage.getItem(AUTOSCAN_KEY);
        if (stored !== null) {
            update({ autoScan: stored === 'true' });
        }
    } catch {
        // Ignore — default is false
    }
}

function saveAutoScanPref(): void {
    try {
        localStorage.setItem(AUTOSCAN_KEY, String(getState().autoScan));
    } catch {
        // Ignore
    }
}

function loadLanguagePref(): void {
    try {
        const stored = localStorage.getItem(LANG_KEY);
        if (stored) {
            // Validate stored code is a known language
            const all = getAllLanguages();
            if (all.some((l) => l.code === stored)) {
                update({ ocrLanguage: stored });
            }
        }
    } catch {
        // Ignore — default is 'ron'
    }
}

function saveLanguagePref(): void {
    try {
        localStorage.setItem(LANG_KEY, getState().ocrLanguage);
    } catch {
        // Ignore
    }
}

function incrementLanguageUsage(code: string): void {
    try {
        const usage = getLanguageUsage();
        usage[code] = (usage[code] || 0) + 1;
        localStorage.setItem(LANG_USAGE_KEY, JSON.stringify(usage));
    } catch {
        // Ignore
    }
}

export function getLanguageUsage(): Record<string, number> {
    try {
        const stored = localStorage.getItem(LANG_USAGE_KEY);
        return stored ? JSON.parse(stored) : {};
    } catch {
        return {};
    }
}

async function init(): Promise<void> {
    // Restore saved data
    loadBooks();
    loadAutoScanPref();
    loadLanguagePref();

    // Show home view immediately
    update({ view: 'home' });

    // Preload OCR engine in background with selected language
    const lang = getState().ocrLanguage;
    textRecognizer = new TextRecognizer();
    textRecognizer.init(lang).then(() => {
        update({ ocrReady: true });
    }).catch((err) => {
        console.error('OCR preload failed:', err);
        toast('Scanner engine failed to load. Scanning may not work.');
    });
}

async function startCameraView(): Promise<void> {
    try {
        hideError();

        if (!getState().ocrReady) {
            toast('Preparing scanner, please wait...');
            // Wait for OCR to finish loading
            await new Promise<void>((resolve) => {
                const check = () => {
                    if (getState().ocrReady) { resolve(); return; }
                    const unsub = on('change', () => {
                        if (getState().ocrReady) { unsub(); resolve(); }
                    });
                };
                check();
            });
        }

        const videoEl = getVideoElement();
        const canvasEl = getCanvasElement();
        cameraManager = new CameraManager(videoEl, canvasEl);

        await cameraManager.start(() => {
            toast('Camera disconnected');
            stopScanning();
        });

        update({ view: 'scan' });

        startScanning(cameraManager, textRecognizer, bookSearcher);
    } catch (err) {
        showError((err as Error).message || 'Failed to start camera. Please ensure camera access is allowed.');
    }
}

function stopCameraView(): void {
    stopScanning();
    if (cameraManager) {
        cameraManager.stop();
        cameraManager = null;
    }
    update({ view: 'home' });
}

function handleAutoScanToggle(): void {
    const newVal = !getState().autoScan;
    update({ autoScan: newVal });
    saveAutoScanPref();

    if (!cameraManager) return;

    if (newVal) {
        // Turning auto-scan ON — resume the loop
        resumeAutoScan(cameraManager, textRecognizer, bookSearcher);
    } else {
        // Turning auto-scan OFF — stop the loop but keep camera active
        pauseAutoScan();
    }
}

async function handleManualScan(): Promise<void> {
    if (!cameraManager) return;
    await scanOnce(cameraManager, textRecognizer, bookSearcher);
}

async function handleLanguageChange(langCode: string): Promise<void> {
    if (langCode === getState().ocrLanguage) return;

    update({ isChangingLanguage: true, ocrLanguage: langCode });
    saveLanguagePref();
    incrementLanguageUsage(langCode);

    try {
        await textRecognizer.setLanguage(langCode);
    } catch (err) {
        console.error('Language change failed:', err);
        toast('Failed to load language data. Check your connection.');
    } finally {
        update({ isChangingLanguage: false });
    }
}

const MAX_IMAGE_DIM = 1920;

async function handleImageUpload(file: File): Promise<void> {
    update({ isProcessingImage: true });

    try {
        if (!getState().ocrReady) {
            toast('Scanner is still loading, please wait...');
            await new Promise<void>((resolve) => {
                const unsub = on('change', () => {
                    if (getState().ocrReady) { unsub(); resolve(); }
                });
            });
        }

        const img = new Image();
        const url = URL.createObjectURL(file);
        img.src = url;

        await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error('Failed to load image'));
        });

        // Cap dimensions for performance
        let w = img.naturalWidth;
        let h = img.naturalHeight;
        if (w > MAX_IMAGE_DIM || h > MAX_IMAGE_DIM) {
            const scale = MAX_IMAGE_DIM / Math.max(w, h);
            w = Math.round(w * scale);
            h = Math.round(h * scale);
        }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Could not create canvas context');
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);

        const textBlocks = await textRecognizer.recognize(canvas);
        const allNewBooks = await searchTextBlocks(textBlocks, bookSearcher);

        if (textBlocks.length === 0) {
            toast('No text detected in this image');
        } else if (allNewBooks.length === 0) {
            toast('No new books found in this image');
        } else {
            addCandidates(allNewBooks);
        }
    } catch (err) {
        console.error('Image upload error:', err);
        toast('Failed to process image');
    } finally {
        update({ isProcessingImage: false });
    }
}

function addBookAndSave(book: Book): boolean {
    const added = addBook(book);
    if (added) {
        toast(`Found: ${book.title}`);
    }
    return added;
}

// Initialize UI with event handlers
initUI({
    onStartCamera: () => startCameraView(),
    onStopCamera: () => stopCameraView(),
    onAutoScanToggle: () => handleAutoScanToggle(),
    onManualScan: () => handleManualScan(),
    onImageUpload: (file: File) => handleImageUpload(file),
    onExport: () => {
        if (getState().books.length === 0) {
            toast('No books to export');
            return;
        }
        exportToCsv(getState().books);
    },
    onClear: () => {
        const count = getState().books.length;
        if (count === 0) return;
        if (!confirm(`Remove all ${count} books?`)) return;
        clearBooks();
        bookSearcher.clear();
        saveBooks();
    },
    onRetry: () => {
        startCameraView();
    },
    onRemoveBook: (index: number) => {
        const removed = removeBook(index);
        if (removed) {
            bookSearcher.removeBookId(removed.id);
            saveBooks();
        }
    },
    onAddCandidate: (bookId: string) => {
        const candidates = getState().candidateBooks;
        const book = candidates.find((b) => b.id === bookId);
        if (book) {
            addBookAndSave(book);
            removeCandidateById(bookId);
        }
    },
    onDismissCandidates: () => {
        clearCandidates();
    },
    onLanguageChange: (langCode: string) => handleLanguageChange(langCode),
    getLanguageUsage,
});

// Persist books on every state change
on('change', saveBooks);

// Register service worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js', {
        updateViaCache: 'none',
    }).catch((err) => {
        console.warn('Service worker registration failed:', err);
    });
}

// Start the app
init();
