import { $, $as } from './dom';
import { getState, update, on, moveBook, type Book } from './state';

const MAX_DISPLAY_TEXT_LENGTH = 60;
const TOAST_DISPLAY_MS = 2000;
const TOAST_CLEANUP_FALLBACK_MS = 500;
const CONFIDENCE_HIGH_THRESHOLD = 70;
const CONFIDENCE_MID_THRESHOLD = 40;

const NO_COVER_SVG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='64'%3E%3Crect fill='%23333' width='48' height='64'/%3E%3Ctext x='24' y='36' text-anchor='middle' fill='%23666' font-size='10'%3ENo cover%3C/text%3E%3C/svg%3E";

// --- Language data ---

export interface OcrLanguage {
    code: string;
    name: string;
    flag: string;
}

const ALL_LANGUAGES: OcrLanguage[] = [
    { code: 'ron', name: 'Romanian', flag: '\u{1F1F7}\u{1F1F4}' },
    { code: 'eng', name: 'English', flag: '\u{1F1EC}\u{1F1E7}' },
    { code: 'fra', name: 'French', flag: '\u{1F1EB}\u{1F1F7}' },
    { code: 'deu', name: 'German', flag: '\u{1F1E9}\u{1F1EA}' },
    { code: 'ita', name: 'Italian', flag: '\u{1F1EE}\u{1F1F9}' },
    { code: 'spa', name: 'Spanish', flag: '\u{1F1EA}\u{1F1F8}' },
    { code: 'por', name: 'Portuguese', flag: '\u{1F1F5}\u{1F1F9}' },
    { code: 'nld', name: 'Dutch', flag: '\u{1F1F3}\u{1F1F1}' },
    { code: 'pol', name: 'Polish', flag: '\u{1F1F5}\u{1F1F1}' },
    { code: 'hun', name: 'Hungarian', flag: '\u{1F1ED}\u{1F1FA}' },
    { code: 'ces', name: 'Czech', flag: '\u{1F1E8}\u{1F1FF}' },
    { code: 'tur', name: 'Turkish', flag: '\u{1F1F9}\u{1F1F7}' },
    { code: 'swe', name: 'Swedish', flag: '\u{1F1F8}\u{1F1EA}' },
    { code: 'rus', name: 'Russian', flag: '\u{1F1F7}\u{1F1FA}' },
    { code: 'jpn', name: 'Japanese', flag: '\u{1F1EF}\u{1F1F5}' },
    { code: 'zho', name: 'Chinese', flag: '\u{1F1E8}\u{1F1F3}' },
];

const DEFAULT_VISIBLE_CODES = ['ron', 'eng', 'fra', 'deu', 'ita', 'spa'];
const VISIBLE_COUNT = 6;

export function getVisibleLanguages(usage: Record<string, number>): OcrLanguage[] {
    const hasUsage = Object.keys(usage).length > 0;
    if (!hasUsage) {
        return ALL_LANGUAGES.filter((l) => DEFAULT_VISIBLE_CODES.includes(l.code));
    }
    const sorted = [...ALL_LANGUAGES].sort((a, b) => {
        const ua = usage[a.code] || 0;
        const ub = usage[b.code] || 0;
        if (ub !== ua) return ub - ua;
        const aIdx = DEFAULT_VISIBLE_CODES.indexOf(a.code);
        const bIdx = DEFAULT_VISIBLE_CODES.indexOf(b.code);
        if (aIdx >= 0 && bIdx < 0) return -1;
        if (bIdx >= 0 && aIdx < 0) return 1;
        return a.name.localeCompare(b.name);
    });
    return sorted.slice(0, VISIBLE_COUNT);
}

export function getAllLanguages(): readonly OcrLanguage[] {
    return ALL_LANGUAGES;
}

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
let btnHomeExportText: HTMLElement;
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
let candidateSearch: HTMLInputElement;

// Language selector
let languageSelector: HTMLElement;
let languageExpanded = false;

// Shared
let errorOverlay: HTMLElement;
let errorMessage: HTMLElement;
let btnRetry: HTMLElement;

// Language usage getter (set by app.ts via initUI)
let getLanguageUsage: () => Record<string, number> = () => ({});

export interface UIHandlers {
    onStartCamera: () => void;
    onStopCamera: () => void;
    onAutoScanToggle: () => void;
    onManualScan: () => void;
    onImageUpload: (file: File) => void;
    onExportText: () => void;
    onExport: () => void;
    onClear: () => void;
    onRetry: () => void;
    onRemoveBook: (index: number) => void;
    onAddCandidate: (bookId: string) => void;
    onDismissCandidates: () => void;
    onLanguageChange: (langCode: string) => void;
    getLanguageUsage: () => Record<string, number>;
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
    btnHomeExportText = $('#btn-home-export-text');
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
    candidateSearch = $as('#candidate-search', HTMLInputElement);

    // Language selector
    languageSelector = $('#language-selector');
    getLanguageUsage = handlers.getLanguageUsage;

    // Shared
    errorOverlay = $('#error-overlay');
    errorMessage = $('#error-message');
    btnRetry = $('#btn-retry');

    // Bind handlers
    btnStartCamera.addEventListener('click', handlers.onStartCamera);
    btnBack.addEventListener('click', handlers.onStopCamera);
    btnRetry.addEventListener('click', handlers.onRetry);
    btnHomeExportText.addEventListener('click', handlers.onExportText);
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

    // Drag-and-drop reorder
    let dragFromIndex = -1;

    homeBookList.addEventListener('dragstart', (e: Event) => {
        const de = e as DragEvent;
        const card = (de.target as HTMLElement).closest('.book-card') as HTMLElement | null;
        if (!card) return;
        dragFromIndex = parseInt(card.dataset.index!, 10);
        card.classList.add('dragging');
        if (de.dataTransfer) {
            de.dataTransfer.effectAllowed = 'move';
        }
    });

    homeBookList.addEventListener('dragover', (e: Event) => {
        e.preventDefault();
        const de = e as DragEvent;
        if (de.dataTransfer) de.dataTransfer.dropEffect = 'move';
        const card = (de.target as HTMLElement).closest('.book-card') as HTMLElement | null;
        if (!card) return;
        card.classList.add('drag-over');
    });

    homeBookList.addEventListener('dragleave', (e: Event) => {
        const card = (e.target as HTMLElement).closest('.book-card') as HTMLElement | null;
        if (card) card.classList.remove('drag-over');
    });

    homeBookList.addEventListener('drop', (e: Event) => {
        e.preventDefault();
        const card = (e.target as HTMLElement).closest('.book-card') as HTMLElement | null;
        if (!card) return;
        card.classList.remove('drag-over');
        const toIndex = parseInt(card.dataset.index!, 10);
        if (dragFromIndex >= 0 && dragFromIndex !== toIndex) {
            moveBook(dragFromIndex, toIndex);
        }
        dragFromIndex = -1;
    });

    homeBookList.addEventListener('dragend', (e: Event) => {
        const card = (e.target as HTMLElement).closest('.book-card') as HTMLElement | null;
        if (card) card.classList.remove('dragging');
        dragFromIndex = -1;
    });

    // Book popup: dismiss
    btnPopupDismiss.addEventListener('click', handlers.onDismissCandidates);
    (bookPopup.querySelector('.book-popup-backdrop') as HTMLElement)
        .addEventListener('click', handlers.onDismissCandidates);

    // Focus trap: keep Tab cycling within the popup while it's visible
    bookPopup.addEventListener('keydown', (e: Event) => {
        const ke = e as KeyboardEvent;
        if (ke.key === 'Escape') {
            handlers.onDismissCandidates();
            return;
        }
        if (ke.key !== 'Tab') return;
        const focusable = bookPopup.querySelectorAll<HTMLElement>(
            'input, button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (ke.shiftKey && document.activeElement === first) {
            ke.preventDefault();
            last.focus();
        } else if (!ke.shiftKey && document.activeElement === last) {
            ke.preventDefault();
            first.focus();
        }
    });

    // Book popup: add candidate (event delegation)
    bookPopupList.addEventListener('click', (e: Event) => {
        const btn = (e.target as HTMLElement).closest('.btn-add-book') as HTMLElement | null;
        if (!btn) return;
        const bookId = btn.dataset.bookId;
        if (bookId) {
            handlers.onAddCandidate(bookId);
        }
    });

    // Candidate search filter
    candidateSearch.addEventListener('input', () => {
        update({ candidateFilter: candidateSearch.value });
    });

    // Language selector (event delegation)
    languageSelector.addEventListener('click', (e: Event) => {
        const btn = (e.target as HTMLElement).closest('.lang-btn') as HTMLElement | null;
        if (!btn) return;
        const code = btn.dataset.lang;
        if (code === 'more') {
            languageExpanded = !languageExpanded;
            renderLanguageSelector();
            return;
        }
        if (code) {
            handlers.onLanguageChange(code);
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
    document.body.style.overflow = 'hidden';
}

export function hideError(): void {
    errorOverlay.hidden = true;
    document.body.style.overflow = '';
}

function renderUI(): void {
    const state = getState();

    // View switching
    const isHome = state.view === 'home';
    homeView.hidden = !isHome;
    scanView.hidden = isHome;

    // OCR status indicator
    ocrStatus.hidden = state.ocrReady;

    // Image processing state
    homeProcessing.hidden = !state.isProcessingImage;
    (btnUploadImage as HTMLButtonElement).disabled = state.isProcessingImage || state.isChangingLanguage;
    (btnStartCamera as HTMLButtonElement).disabled = state.isProcessingImage || state.isChangingLanguage;

    // Home view book list and controls
    renderHomeBookList();
    const count = state.books.length;
    homeBookCount.textContent = `${count} book${count !== 1 ? 's' : ''} found`;
    (btnHomeExportText as HTMLButtonElement).disabled = count === 0;
    (btnHomeExport as HTMLButtonElement).disabled = count === 0;
    (btnHomeClear as HTMLButtonElement).disabled = count === 0;

    // Language selector
    renderLanguageSelector();

    // Scan view status
    scanCountEl.textContent = `Scans: ${state.scanCount}`;
    scanStatusEl.textContent = state.isScanning
        ? (state.autoScan ? 'Auto-scanning' : 'Manual')
        : 'Paused';
    scanStatusEl.className = state.isScanning ? 'scan-active' : 'scan-paused';

    // Last detected text
    const displayText = state.lastDetectedText.length > MAX_DISPLAY_TEXT_LENGTH
        ? state.lastDetectedText.substring(0, MAX_DISPLAY_TEXT_LENGTH) + '...'
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
    const wasPopupHidden = bookPopup.hidden;
    bookPopup.hidden = candidates.length === 0;
    if (candidates.length > 0) {
        const popupTitle = bookPopup.querySelector('.book-popup-title') as HTMLElement;
        popupTitle.textContent = `${candidates.length} Book${candidates.length !== 1 ? 's' : ''} Found`;

        // Apply search filter
        const filter = state.candidateFilter.toLowerCase().trim();
        const filtered = filter
            ? candidates.filter((book) => {
                const title = book.title.toLowerCase();
                const authors = book.authors.join(' ').toLowerCase();
                const isbn = (book.isbn || '').toLowerCase();
                return title.includes(filter) || authors.includes(filter) || isbn.includes(filter);
            })
            : candidates;

        // Sort by confidence descending
        const sorted = [...filtered].sort((a, b) => b.confidence - a.confidence);
        renderCandidateList(sorted);

        // Sync input without cursor jump
        if (candidateSearch.value !== state.candidateFilter) {
            candidateSearch.value = state.candidateFilter;
        }

        // Focus search input when popup first appears
        if (wasPopupHidden) {
            candidateSearch.focus();
        }
    } else {
        candidateSearch.value = '';
    }
}

function renderLanguageSelector(): void {
    const state = getState();
    const usage = getLanguageUsage();
    const visible = getVisibleLanguages(usage);
    const remaining = ALL_LANGUAGES.filter((l) => !visible.some((v) => v.code === l.code));
    const disabled = state.isChangingLanguage;

    let html = '<div class="lang-grid">';

    for (const lang of visible) {
        const isActive = lang.code === state.ocrLanguage;
        html += `<button class="lang-btn${isActive ? ' lang-active' : ''}" data-lang="${lang.code}" title="${lang.name}"${disabled ? ' disabled' : ''}>
            <span class="lang-flag">${lang.flag}</span>
            <span class="lang-label">${lang.name}</span>
        </button>`;
    }

    html += `<button class="lang-btn lang-more${languageExpanded ? ' lang-active' : ''}" data-lang="more" title="More languages">
        <span class="lang-flag">\u{22EF}</span>
        <span class="lang-label">More</span>
    </button>`;

    html += '</div>';

    if (languageExpanded && remaining.length > 0) {
        html += '<div class="lang-grid lang-grid-expanded">';
        for (const lang of remaining) {
            const isActive = lang.code === state.ocrLanguage;
            html += `<button class="lang-btn${isActive ? ' lang-active' : ''}" data-lang="${lang.code}" title="${lang.name}"${disabled ? ' disabled' : ''}>
                <span class="lang-flag">${lang.flag}</span>
                <span class="lang-label">${lang.name}</span>
            </button>`;
        }
        html += '</div>';
    }

    if (state.isChangingLanguage) {
        html += '<div class="lang-loading"><div class="spinner spinner-sm"></div> Loading language...</div>';
    }

    languageSelector.innerHTML = html;
}

function renderBookImage(book: Book): string {
    return book.thumbnailUrl
        ? `<img src="${escapeHtml(book.thumbnailUrl)}" alt="Cover" loading="lazy">`
        : `<img src="${NO_COVER_SVG}" alt="No cover">`;
}

function renderBookMeta(book: Book): string {
    const authors = book.authors.join(', ');
    return `<div class="book-title">${escapeHtml(book.title)}</div>
        ${authors ? `<div class="book-authors">${escapeHtml(authors)}</div>` : ''}
        ${book.isbn ? `<div class="book-isbn">ISBN: ${escapeHtml(book.isbn)}</div>` : ''}`;
}

function confidenceClass(confidence: number): string {
    if (confidence >= CONFIDENCE_HIGH_THRESHOLD) return 'confidence-high';
    if (confidence >= CONFIDENCE_MID_THRESHOLD) return 'confidence-mid';
    return 'confidence-low';
}

function renderHomeBookList(): void {
    const books = getState().books;

    if (books.length === 0) {
        homeBookList.innerHTML = '<div class="empty-state">No books found yet. Scan book spines with your camera or upload a photo to get started.</div>';
        return;
    }

    homeBookList.innerHTML = books.map((book, index) => {
        const infoLink = book.infoLink ? escapeHtml(book.infoLink) : '';
        const titleHtml = infoLink
            ? `<a href="${infoLink}" target="_blank" rel="noopener noreferrer" class="book-link">${escapeHtml(book.title)}</a>`
            : escapeHtml(book.title);

        return `<div class="book-card" draggable="true" data-index="${index}">
            <div class="drag-handle" aria-label="Drag to reorder" title="Drag to reorder">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="8" cy="4" r="2"/><circle cx="16" cy="4" r="2"/>
                    <circle cx="8" cy="12" r="2"/><circle cx="16" cy="12" r="2"/>
                    <circle cx="8" cy="20" r="2"/><circle cx="16" cy="20" r="2"/>
                </svg>
            </div>
            ${renderBookImage(book)}
            <div class="book-info">
                <div class="book-title">${titleHtml}</div>
                ${book.authors.length ? `<div class="book-authors">${escapeHtml(book.authors.join(', '))}</div>` : ''}
                ${book.isbn ? `<div class="book-isbn">ISBN: ${escapeHtml(book.isbn)}</div>` : ''}
            </div>
            <button class="btn-remove" data-index="${index}" title="Remove" aria-label="Remove ${escapeHtml(book.title)}">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                </svg>
            </button>
        </div>`;
    }).join('');
}

function renderCandidateList(candidates: Book[]): void {
    bookPopupList.innerHTML = candidates.map((book) => `<div class="candidate-card">
            ${renderBookImage(book)}
            <div class="candidate-info">
                ${renderBookMeta(book)}
                <div class="confidence-badge ${confidenceClass(book.confidence)}">${book.confidence}% match</div>
            </div>
            <button class="btn-add-book" data-book-id="${escapeHtml(book.id)}" aria-label="Add ${escapeHtml(book.title)}">Add</button>
        </div>`).join('');
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
        setTimeout(cleanup, TOAST_CLEANUP_FALLBACK_MS);
    }, TOAST_DISPLAY_MS);
}
