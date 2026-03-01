import { $, $as } from './dom';
import { getState, on } from './state';

// DOM element references (queried once in initUI)

// Home view elements
let homeView: HTMLElement;
let ocrStatus: HTMLElement;
let btnStartCamera: HTMLElement;
let btnUploadImage: HTMLElement;
let photoInput: HTMLInputElement;
let homeProcessing: HTMLElement;
let homeBookCount: HTMLElement;
let homeBookList: HTMLElement;
let btnHomeExport: HTMLElement;
let btnHomeClear: HTMLElement;

// Scan view elements
let scanView: HTMLElement;
let videoEl: HTMLVideoElement;
let canvasEl: HTMLCanvasElement;
let statusOverlay: HTMLElement;
let scanCountEl: HTMLElement;
let scanStatusEl: HTMLElement;
let lastTextEl: HTMLElement;
let btnBack: HTMLElement;
let autoScanSwitch: HTMLElement;
let btnScanNow: HTMLElement;
let scanBookCount: HTMLElement;

// Book popup
let bookPopup: HTMLElement;
let bookPopupList: HTMLElement;
let btnPopupDismiss: HTMLElement;

// Shared
let errorOverlay: HTMLElement;
let errorMessage: HTMLElement;
let btnRetry: HTMLElement;

export interface UIHandlers {
    onStartCamera: () => void;
    onStopCamera: () => void;
    onAutoScanToggle: () => void;
    onManualScan: () => void;
    onImageUpload: (file: File) => void;
    onExport: () => void;
    onClear: () => void;
    onRetry: () => void;
    onRemoveBook: (index: number) => void;
    onAddCandidate: (bookId: string) => void;
    onDismissCandidates: () => void;
}

export function initUI(handlers: UIHandlers): void {
    // Home view
    homeView = $('#home-view');
    ocrStatus = $('#ocr-status');
    btnStartCamera = $('#btn-start-camera');
    btnUploadImage = $('#btn-upload-image');
    photoInput = $as('#photo-input', HTMLInputElement);
    homeProcessing = $('#home-processing');
    homeBookCount = $('#home-book-count');
    homeBookList = $('#home-book-list');
    btnHomeExport = $('#btn-home-export');
    btnHomeClear = $('#btn-home-clear');

    // Scan view
    scanView = $('#scan-view');
    videoEl = $as('#camera', HTMLVideoElement);
    canvasEl = $as('#capture', HTMLCanvasElement);
    statusOverlay = $('#status-overlay');
    scanCountEl = $('#scan-count');
    scanStatusEl = $('#scan-status');
    lastTextEl = $('#last-text');
    btnBack = $('#btn-back');
    autoScanSwitch = $('#auto-scan-switch');
    btnScanNow = $('#btn-scan-now');
    scanBookCount = $('#scan-book-count');

    // Book popup
    bookPopup = $('#book-popup');
    bookPopupList = $('#book-popup-list');
    btnPopupDismiss = $('#btn-popup-dismiss');

    // Shared
    errorOverlay = $('#error-overlay');
    errorMessage = $('#error-message');
    btnRetry = $('#btn-retry');

    // Bind handlers
    btnStartCamera.addEventListener('click', handlers.onStartCamera);
    btnBack.addEventListener('click', handlers.onStopCamera);
    btnRetry.addEventListener('click', handlers.onRetry);
    btnHomeExport.addEventListener('click', handlers.onExport);
    btnHomeClear.addEventListener('click', handlers.onClear);

    // Auto-scan toggle
    autoScanSwitch.addEventListener('click', handlers.onAutoScanToggle);
    autoScanSwitch.addEventListener('keydown', (e: Event) => {
        const key = (e as KeyboardEvent).key;
        if (key === ' ' || key === 'Enter') {
            e.preventDefault();
            handlers.onAutoScanToggle();
        }
    });

    // Manual scan button
    btnScanNow.addEventListener('click', handlers.onManualScan);

    // Image upload
    btnUploadImage.addEventListener('click', () => photoInput.click());
    photoInput.addEventListener('change', () => {
        const file = photoInput.files?.[0];
        if (file) {
            handlers.onImageUpload(file);
            photoInput.value = '';
        }
    });

    // Remove individual book (event delegation on home book list)
    homeBookList.addEventListener('click', (e: Event) => {
        const btn = (e.target as HTMLElement).closest('.btn-remove') as HTMLElement | null;
        if (!btn) return;
        const index = parseInt(btn.dataset.index!, 10);
        if (index >= 0 && index < getState().books.length) {
            handlers.onRemoveBook(index);
        }
    });

    // Book popup: dismiss
    btnPopupDismiss.addEventListener('click', handlers.onDismissCandidates);
    (bookPopup.querySelector('.book-popup-backdrop') as HTMLElement)
        .addEventListener('click', handlers.onDismissCandidates);

    // Book popup: add candidate (event delegation)
    bookPopupList.addEventListener('click', (e: Event) => {
        const btn = (e.target as HTMLElement).closest('.btn-add-book') as HTMLElement | null;
        if (!btn) return;
        const bookId = btn.dataset.bookId;
        if (bookId) {
            handlers.onAddCandidate(bookId);
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

export function showError(message: string): void {
    errorMessage.textContent = message;
    errorOverlay.hidden = false;
}

export function hideError(): void {
    errorOverlay.hidden = true;
}

function renderUI(): void {
    const state = getState();

    // View switching
    const isHome = state.view === 'home';
    homeView.hidden = !isHome;
    scanView.hidden = isHome;

    // OCR status indicator
    if (state.ocrReady) {
        ocrStatus.hidden = true;
    } else {
        ocrStatus.hidden = false;
    }

    // Image processing state
    homeProcessing.hidden = !state.isProcessingImage;
    (btnUploadImage as HTMLButtonElement).disabled = state.isProcessingImage;
    (btnStartCamera as HTMLButtonElement).disabled = state.isProcessingImage;

    // Home view book list and controls
    renderHomeBookList();
    const count = state.books.length;
    homeBookCount.textContent = `${count} book${count !== 1 ? 's' : ''} found`;
    (btnHomeExport as HTMLButtonElement).disabled = count === 0;
    (btnHomeClear as HTMLButtonElement).disabled = count === 0;

    // Scan view status
    scanCountEl.textContent = `Scans: ${state.scanCount}`;
    scanStatusEl.textContent = state.isScanning
        ? (state.autoScan ? 'Auto-scanning' : 'Manual')
        : 'Paused';
    scanStatusEl.className = state.isScanning ? 'scan-active' : 'scan-paused';

    // Last detected text
    const displayText = state.lastDetectedText.length > 60
        ? state.lastDetectedText.substring(0, 60) + '...'
        : state.lastDetectedText;
    lastTextEl.textContent = displayText;

    // Scan view book count
    scanBookCount.textContent = `${count} book${count !== 1 ? 's' : ''} found`;

    // Auto-scan toggle
    autoScanSwitch.setAttribute('aria-checked', String(state.autoScan));
    autoScanSwitch.classList.toggle('toggle-on', state.autoScan);

    // Show/hide manual scan button
    btnScanNow.hidden = state.autoScan;

    // Book selection popup
    const candidates = state.candidateBooks;
    bookPopup.hidden = candidates.length === 0;
    if (candidates.length > 0) {
        const popupTitle = bookPopup.querySelector('.book-popup-title') as HTMLElement;
        popupTitle.textContent = `${candidates.length} Book${candidates.length !== 1 ? 's' : ''} Found`;
        renderCandidateList(candidates);
    }
}

function renderHomeBookList(): void {
    const books = getState().books;

    if (books.length === 0) {
        homeBookList.innerHTML = '<div class="empty-state">No books found yet. Scan book spines with your camera or upload a photo to get started.</div>';
        return;
    }

    homeBookList.innerHTML = books.map((book, index) => {
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

function renderCandidateList(candidates: import('./books').Book[]): void {
    bookPopupList.innerHTML = candidates.map((book) => {
        const authors = book.authors.join(', ');
        const imgSrc = book.thumbnailUrl || '';
        const imgTag = imgSrc
            ? `<img src="${escapeHtml(imgSrc)}" alt="Cover" loading="lazy">`
            : `<img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='64'%3E%3Crect fill='%23333' width='48' height='64'/%3E%3Ctext x='24' y='36' text-anchor='middle' fill='%23666' font-size='10'%3ENo cover%3C/text%3E%3C/svg%3E" alt="No cover">`;

        return `<div class="candidate-card">
            ${imgTag}
            <div class="candidate-info">
                <div class="book-title">${escapeHtml(book.title)}</div>
                ${authors ? `<div class="book-authors">${escapeHtml(authors)}</div>` : ''}
                ${book.isbn ? `<div class="book-isbn">ISBN: ${escapeHtml(book.isbn)}</div>` : ''}
            </div>
            <button class="btn-add-book" data-book-id="${escapeHtml(book.id)}" aria-label="Add ${escapeHtml(book.title)}">Add</button>
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
