import { CameraManager } from './camera.js';
import { TextRecognizer } from './ocr.js';
import { BookSearcher } from './books.js';
import { exportToCsv } from './export.js';

// App state
const state = {
    books: [],
    isScanning: true,
    scanCount: 0,
    lastDetectedText: '',
};

// Core components
let cameraManager;
let textRecognizer;
let bookSearcher;
let scanInterval;
let listenersAttached = false;

// DOM elements
const videoEl = document.getElementById('camera');
const canvasEl = document.getElementById('capture');
const loadingOverlay = document.getElementById('loading-overlay');
const errorOverlay = document.getElementById('error-overlay');
const errorMessage = document.getElementById('error-message');
const statusOverlay = document.getElementById('status-overlay');
const bookOverlay = document.getElementById('book-overlay');
const scanCountEl = document.getElementById('scan-count');
const scanStatusEl = document.getElementById('scan-status');
const lastTextEl = document.getElementById('last-text');
const bookCountEl = document.getElementById('book-count');
const bookListEl = document.getElementById('book-list');
const btnPause = document.getElementById('btn-pause');
const btnExport = document.getElementById('btn-export');
const btnClear = document.getElementById('btn-clear');
const btnRetry = document.getElementById('btn-retry');

// Pause/Resume button SVGs
const ICON_PAUSE = '<svg width="20" height="20" viewBox="0 0 24 24" fill="white"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
const ICON_PLAY = '<svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>';

async function init() {
    try {
        if (scanInterval) clearInterval(scanInterval);
        if (cameraManager) cameraManager.stop();

        cameraManager = new CameraManager(videoEl, canvasEl);
        textRecognizer = new TextRecognizer();
        bookSearcher = new BookSearcher();

        // Initialize OCR engine (downloads WASM + traineddata on first use)
        await textRecognizer.init();

        // Start camera
        await cameraManager.start();

        // Hide loading, show UI
        loadingOverlay.hidden = true;
        statusOverlay.hidden = false;
        bookOverlay.hidden = false;

        // Start scan loop (~1 frame per second)
        scanInterval = setInterval(scanFrame, 1000);

        // Set up event listeners
        setupListeners();
    } catch (err) {
        showError(err.message || 'Failed to initialize. Please ensure camera access is allowed.');
    }
}

async function scanFrame() {
    if (!state.isScanning) return;

    const canvas = cameraManager.captureFrame();
    if (!canvas) return;

    const textBlocks = await textRecognizer.recognize(canvas);
    state.scanCount++;

    for (const text of textBlocks) {
        state.lastDetectedText = text;
        const newBooks = await bookSearcher.search(text);
        for (const book of newBooks) {
            state.books.push(book);
        }
    }

    renderUI();
}

function renderUI() {
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

    // Pause button icon
    btnPause.innerHTML = state.isScanning ? ICON_PAUSE : ICON_PLAY;
    btnPause.title = state.isScanning ? 'Pause scanning' : 'Resume scanning';

    // Book list
    renderBookList();
}

function renderBookList() {
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

        return `<div class="book-card">
            ${imgTag}
            <div class="book-info">
                <div class="book-title">${escapeHtml(book.title)}</div>
                ${authors ? `<div class="book-authors">${escapeHtml(authors)}</div>` : ''}
                ${book.isbn ? `<div class="book-isbn">ISBN: ${escapeHtml(book.isbn)}</div>` : ''}
            </div>
            <button class="btn-remove" data-index="${index}" title="Remove">&times;</button>
        </div>`;
    }).join('');
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function setupListeners() {
    if (listenersAttached) return;
    listenersAttached = true;

    // Pause/Resume
    btnPause.addEventListener('click', () => {
        state.isScanning = !state.isScanning;
        renderUI();
    });

    // Export CSV
    btnExport.addEventListener('click', () => {
        exportToCsv(state.books);
    });

    // Clear all
    btnClear.addEventListener('click', () => {
        state.books = [];
        bookSearcher.clear();
        renderUI();
    });

    // Remove individual book (event delegation)
    bookListEl.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-remove');
        if (!btn) return;
        const index = parseInt(btn.dataset.index, 10);
        if (index >= 0 && index < state.books.length) {
            const removed = state.books.splice(index, 1)[0];
            bookSearcher.removeBookId(removed.id);
            renderUI();
        }
    });

}

// Retry button — registered at module level so it works even if init() fails
btnRetry.addEventListener('click', () => {
    errorOverlay.hidden = true;
    loadingOverlay.hidden = false;
    init();
});

function showError(message) {
    loadingOverlay.hidden = true;
    errorMessage.textContent = message;
    errorOverlay.hidden = false;
}

// Register service worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch((err) => {
        console.warn('Service worker registration failed:', err);
    });
}

// Start the app
init();
