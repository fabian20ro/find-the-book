import './style.css';
import { CameraManager } from './camera';
import { TextRecognizer } from './ocr';
import { BookSearcher, type Book } from './books';
import { exportToCsv } from './export';

// App state
interface AppState {
    books: Book[];
    isScanning: boolean;
    scanCount: number;
    lastDetectedText: string;
}

const state: AppState = {
    books: [],
    isScanning: true,
    scanCount: 0,
    lastDetectedText: '',
};

// Core components
let cameraManager: CameraManager;
let textRecognizer: TextRecognizer;
let bookSearcher: BookSearcher;
let scanInterval: ReturnType<typeof setInterval>;
let listenersAttached = false;

// DOM elements
const videoEl = document.getElementById('camera') as HTMLVideoElement;
const canvasEl = document.getElementById('capture') as HTMLCanvasElement;
const loadingOverlay = document.getElementById('loading-overlay')!;
const errorOverlay = document.getElementById('error-overlay')!;
const errorMessage = document.getElementById('error-message')!;
const statusOverlay = document.getElementById('status-overlay')!;
const bookOverlay = document.getElementById('book-overlay')!;
const scanCountEl = document.getElementById('scan-count')!;
const scanStatusEl = document.getElementById('scan-status')!;
const lastTextEl = document.getElementById('last-text')!;
const bookCountEl = document.getElementById('book-count')!;
const bookListEl = document.getElementById('book-list')!;
const btnPause = document.getElementById('btn-pause')!;
const btnExport = document.getElementById('btn-export')!;
const btnClear = document.getElementById('btn-clear')!;
const btnRetry = document.getElementById('btn-retry')!;

// localStorage persistence
const STORAGE_KEY = 'ftb-books';

function saveBooks(): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state.books));
    } catch { /* quota exceeded — ignore */ }
}

function loadBooks(): void {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const books: Book[] = JSON.parse(stored);
            state.books = books;
            for (const book of books) {
                bookSearcher.preloadBookId(book.id);
            }
        }
    } catch { /* corrupted data — ignore */ }
}

// Pause/Resume button SVGs
const ICON_PAUSE = '<svg width="20" height="20" viewBox="0 0 24 24" fill="white"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
const ICON_PLAY = '<svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>';

async function init(): Promise<void> {
    try {
        if (scanInterval) clearInterval(scanInterval);
        if (cameraManager) cameraManager.stop();

        cameraManager = new CameraManager(videoEl, canvasEl);
        textRecognizer = new TextRecognizer();
        bookSearcher = new BookSearcher();

        // Restore previously found books from localStorage
        loadBooks();

        // Initialize OCR engine (downloads WASM + traineddata on first use)
        await textRecognizer.init();

        // Start camera
        await cameraManager.start();

        // Hide loading, show UI
        (loadingOverlay as HTMLElement).hidden = true;
        (statusOverlay as HTMLElement).hidden = false;
        (bookOverlay as HTMLElement).hidden = false;

        // Start scan loop (~1 frame per second)
        scanInterval = setInterval(scanFrame, 1000);

        // Set up event listeners
        setupListeners();
    } catch (err) {
        showError((err as Error).message || 'Failed to initialize. Please ensure camera access is allowed.');
    }
}

async function scanFrame(): Promise<void> {
    if (!state.isScanning) return;

    const canvas = cameraManager.captureFrame();
    if (!canvas) return;

    const textBlocks = await textRecognizer.recognize(canvas);
    state.scanCount++;

    const prevCount = state.books.length;
    for (const text of textBlocks) {
        state.lastDetectedText = text;
        const newBooks = await bookSearcher.search(text);
        for (const book of newBooks) {
            state.books.push(book);
        }
    }

    if (state.books.length > prevCount) saveBooks();
    renderUI();
}

function renderUI(): void {
    // Status bar
    scanCountEl.textContent = `Scans: ${state.scanCount}`;
    scanStatusEl.textContent = state.isScanning ? 'Scanning' : 'Paused';
    scanStatusEl.className = state.isScanning ? 'scan-active' : 'scan-paused';

    // Last detected text (truncated)
    const displayText = state.lastDetectedText.length > 60
        ? state.lastDetectedText.substring(0, 60) + '...'
        : state.lastDetectedText;
    lastTextEl.textContent = displayText;

    // Book count
    const count = state.books.length;
    bookCountEl.textContent = `${count} book${count !== 1 ? 's' : ''} found`;

    // Pause button icon + ARIA
    btnPause.innerHTML = state.isScanning ? ICON_PAUSE : ICON_PLAY;
    btnPause.title = state.isScanning ? 'Pause scanning' : 'Resume scanning';
    btnPause.setAttribute('aria-label', state.isScanning ? 'Pause scanning' : 'Resume scanning');

    // Disable export/clear when no books
    (btnExport as HTMLButtonElement).disabled = state.books.length === 0;
    (btnClear as HTMLButtonElement).disabled = state.books.length === 0;

    // Book list
    renderBookList();
}

function renderBookList(): void {
    if (state.books.length === 0) {
        bookListEl.innerHTML = '<div class="empty-state">Point camera at book spines to start scanning</div>';
        return;
    }

    bookListEl.innerHTML = state.books.map((book, index) => {
        const authors = book.authors.join(', ');
        const imgSrc = book.thumbnailUrl || '';
        const imgTag = imgSrc
            ? `<img src="${escapeHtml(imgSrc)}" alt="Cover" loading="lazy">`
            : `<img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='64'%3E%3Crect fill='%23333' width='48' height='64'/%3E%3Ctext x='24' y='36' text-anchor='middle' fill='%23666' font-size='10'%3ENo cover%3C/text%3E%3C/svg%3E" alt="No cover">`;

        const infoLink = book.infoLink ? escapeHtml(book.infoLink) : '';
        const titleHtml = infoLink
            ? `<a href="${infoLink}" target="_blank" rel="noopener noreferrer" class="book-link">${escapeHtml(book.title)}</a>`
            : escapeHtml(book.title);

        return `<div class="book-card">
            ${imgTag}
            <div class="book-info">
                <div class="book-title">${titleHtml}</div>
                ${authors ? `<div class="book-authors">${escapeHtml(authors)}</div>` : ''}
                ${book.isbn ? `<div class="book-isbn">ISBN: ${escapeHtml(book.isbn)}</div>` : ''}
            </div>
            <button class="btn-remove" data-index="${index}" title="Remove" aria-label="Remove ${escapeHtml(book.title)}">&times;</button>
        </div>`;
    }).join('');
}

function escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function setupListeners(): void {
    if (listenersAttached) return;
    listenersAttached = true;

    // Pause/Resume
    btnPause.addEventListener('click', () => {
        state.isScanning = !state.isScanning;
        renderUI();
    });

    // Export CSV
    btnExport.addEventListener('click', () => {
        if (state.books.length === 0) {
            showToast('No books to export');
            return;
        }
        exportToCsv(state.books);
    });

    // Clear all (with confirmation)
    btnClear.addEventListener('click', () => {
        if (state.books.length === 0) return;
        if (!confirm(`Remove all ${state.books.length} books?`)) return;
        state.books = [];
        bookSearcher.clear();
        saveBooks();
        renderUI();
    });

    // Remove individual book (event delegation)
    bookListEl.addEventListener('click', (e: Event) => {
        const btn = (e.target as HTMLElement).closest('.btn-remove') as HTMLElement | null;
        if (!btn) return;
        const index = parseInt(btn.dataset.index!, 10);
        if (index >= 0 && index < state.books.length) {
            const removed = state.books.splice(index, 1)[0];
            bookSearcher.removeBookId(removed.id);
            saveBooks();
            renderUI();
        }
    });
}

// Retry button — registered at module level so it works even if init() fails
btnRetry.addEventListener('click', () => {
    (errorOverlay as HTMLElement).hidden = true;
    (loadingOverlay as HTMLElement).hidden = false;
    init();
});

function showToast(message: string): void {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('toast-visible'));
    setTimeout(() => {
        toast.classList.remove('toast-visible');
        toast.addEventListener('transitionend', () => toast.remove());
    }, 2000);
}

function showError(message: string): void {
    (loadingOverlay as HTMLElement).hidden = true;
    errorMessage.textContent = message;
    (errorOverlay as HTMLElement).hidden = false;
}

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
