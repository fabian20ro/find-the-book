import { $, $as } from './dom';
import { getState, on } from './state';

// Pause/Resume button SVGs
const ICON_PAUSE = '<svg width="20" height="20" viewBox="0 0 24 24" fill="white"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
const ICON_PLAY = '<svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>';

// DOM element references (queried once in initUI)
let videoEl: HTMLVideoElement;
let canvasEl: HTMLCanvasElement;
let loadingOverlay: HTMLElement;
let errorOverlay: HTMLElement;
let errorMessage: HTMLElement;
let statusOverlay: HTMLElement;
let bookOverlay: HTMLElement;
let scanCountEl: HTMLElement;
let scanStatusEl: HTMLElement;
let lastTextEl: HTMLElement;
let bookCountEl: HTMLElement;
let bookListEl: HTMLElement;
let btnPause: HTMLElement;
let btnExport: HTMLElement;
let btnClear: HTMLElement;
let btnRetry: HTMLElement;

export interface UIHandlers {
    onPauseToggle: () => void;
    onExport: () => void;
    onClear: () => void;
    onRetry: () => void;
    onRemoveBook: (index: number) => void;
}

export function initUI(handlers: UIHandlers): void {
    // Query all DOM elements through safe helpers
    videoEl = $as('#camera', HTMLVideoElement);
    canvasEl = $as('#capture', HTMLCanvasElement);
    loadingOverlay = $('#loading-overlay');
    errorOverlay = $('#error-overlay');
    errorMessage = $('#error-message');
    statusOverlay = $('#status-overlay');
    bookOverlay = $('#book-overlay');
    scanCountEl = $('#scan-count');
    scanStatusEl = $('#scan-status');
    lastTextEl = $('#last-text');
    bookCountEl = $('#book-count');
    bookListEl = $('#book-list');
    btnPause = $('#btn-pause');
    btnExport = $('#btn-export');
    btnClear = $('#btn-clear');
    btnRetry = $('#btn-retry');

    // Bind button handlers
    btnPause.addEventListener('click', handlers.onPauseToggle);
    btnExport.addEventListener('click', handlers.onExport);
    btnClear.addEventListener('click', handlers.onClear);
    btnRetry.addEventListener('click', handlers.onRetry);

    // Remove individual book (event delegation)
    bookListEl.addEventListener('click', (e: Event) => {
        const btn = (e.target as HTMLElement).closest('.btn-remove') as HTMLElement | null;
        if (!btn) return;
        const index = parseInt(btn.dataset.index!, 10);
        if (index >= 0 && index < getState().books.length) {
            handlers.onRemoveBook(index);
        }
    });

    // Subscribe to state events
    on('change', renderUI);
    on('toast', showToast);

    // Initial render
    renderUI();
}

export function getVideoElement(): HTMLVideoElement {
    return videoEl;
}

export function getCanvasElement(): HTMLCanvasElement {
    return canvasEl;
}

export function showLoading(): void {
    loadingOverlay.hidden = false;
    errorOverlay.hidden = true;
}

export function hideLoading(): void {
    loadingOverlay.hidden = true;
    statusOverlay.hidden = false;
    bookOverlay.hidden = false;
}

export function showError(message: string): void {
    loadingOverlay.hidden = true;
    errorMessage.textContent = message;
    errorOverlay.hidden = false;
}

function renderUI(): void {
    const state = getState();

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
    const books = getState().books;

    if (books.length === 0) {
        bookListEl.innerHTML = '<div class="empty-state">Point camera at book spines to start scanning</div>';
        return;
    }

    bookListEl.innerHTML = books.map((book, index) => {
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

function showToast(message: string): void {
    const toastEl = document.createElement('div');
    toastEl.className = 'toast';
    toastEl.textContent = message;
    document.body.appendChild(toastEl);
    requestAnimationFrame(() => toastEl.classList.add('toast-visible'));
    setTimeout(() => {
        toastEl.classList.remove('toast-visible');
        const cleanup = () => { toastEl.remove(); };
        toastEl.addEventListener('transitionend', cleanup, { once: true });
        // Fallback: if transitionend never fires (e.g. prefers-reduced-motion), remove after 500ms
        setTimeout(cleanup, 500);
    }, 2000);
}
