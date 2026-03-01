import './style.css';
import { CameraManager } from './camera';
import { TextRecognizer } from './ocr';
import { BookSearcher } from './books';
import { exportToCsv } from './export';
import { getState, update, clearBooks, removeBook, on, toast, type Book } from './state';
import { startScanning, stopScanning } from './scanner';
import { initUI, getVideoElement, getCanvasElement, hideLoading, showLoading, showError } from './ui';

// Core components
const bookSearcher = new BookSearcher();
let cameraManager: CameraManager;
let textRecognizer: TextRecognizer;

// localStorage persistence
const STORAGE_KEY = 'ftb-books';

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

async function init(): Promise<void> {
    try {
        textRecognizer = new TextRecognizer();

        const videoEl = getVideoElement();
        const canvasEl = getCanvasElement();
        cameraManager = new CameraManager(videoEl, canvasEl);

        // Restore previously found books
        loadBooks();

        // Initialize OCR engine
        await textRecognizer.init();

        // Start camera (with disconnect handler)
        await cameraManager.start(() => {
            toast('Camera disconnected');
            stopScanning();
        });

        // Hide loading, show UI
        hideLoading();

        // Start scan loop
        startScanning(cameraManager, textRecognizer, bookSearcher);
    } catch (err) {
        showError((err as Error).message || 'Failed to initialize. Please ensure camera access is allowed.');
    }
}

// Initialize UI with event handlers
initUI({
    onPauseToggle: () => {
        if (getState().isScanning) {
            stopScanning();
        } else {
            startScanning(cameraManager, textRecognizer, bookSearcher);
        }
    },
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
        showLoading();
        init();
    },
    onRemoveBook: (index: number) => {
        const removed = removeBook(index);
        if (removed) {
            bookSearcher.removeBookId(removed.id);
            saveBooks();
        }
    },
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
