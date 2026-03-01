import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { update, addBook, getState } from './state';
import { initUI, showError, hideError, type UIHandlers } from './ui';
import type { Book } from './books';

function makeBook(overrides: Partial<Book> = {}): Book {
    return {
        id: 'b1',
        title: 'Test Book',
        authors: ['Author A'],
        publisher: 'Publisher',
        publishedDate: '2024',
        description: 'A book',
        isbn: '9781234567890',
        pageCount: 200,
        thumbnailUrl: 'https://example.com/thumb.jpg',
        infoLink: 'https://example.com/info',
        ...overrides,
    };
}

function createHandlers(): UIHandlers {
    return {
        onStartCamera: vi.fn(),
        onStopCamera: vi.fn(),
        onAutoScanToggle: vi.fn(),
        onManualScan: vi.fn(),
        onImageUpload: vi.fn(),
        onExport: vi.fn(),
        onClear: vi.fn(),
        onRetry: vi.fn(),
        onRemoveBook: vi.fn(),
    };
}

function setupDOM() {
    document.body.innerHTML = `
        <div id="home-view" class="home-view">
            <div id="ocr-status" class="ocr-status">
                <div class="spinner spinner-sm"></div>
                <span>Preparing scanner...</span>
            </div>
            <button id="btn-start-camera" class="btn-action btn-primary">Scan with Camera</button>
            <button id="btn-upload-image" class="btn-action btn-secondary">Upload Image</button>
            <input type="file" id="photo-input" accept="image/*" hidden>
            <div id="home-processing" class="home-processing" hidden></div>
            <div class="home-book-header">
                <span id="home-book-count">0 books found</span>
                <div class="control-buttons">
                    <button id="btn-home-export" disabled>Export</button>
                    <button id="btn-home-clear" disabled>Clear</button>
                </div>
            </div>
            <div id="home-book-list" class="book-list"></div>
        </div>
        <div id="scan-view" class="scan-view" hidden>
            <video id="camera" autoplay playsinline muted></video>
            <canvas id="capture"></canvas>
            <div id="status-overlay" class="status-overlay">
                <div class="status-row">
                    <button id="btn-back" class="btn-back">Back</button>
                    <span id="scan-count">Scans: 0</span>
                    <span id="scan-status" class="scan-paused">Paused</span>
                </div>
                <div id="last-text" class="last-text"></div>
            </div>
            <div id="scan-controls" class="scan-controls">
                <div class="scan-controls-row">
                    <div class="auto-scan-toggle">
                        <label for="auto-scan-switch">Auto-scan</label>
                        <button id="auto-scan-switch" role="switch" aria-checked="true" class="toggle-switch toggle-on">
                            <span class="toggle-knob"></span>
                        </button>
                    </div>
                    <span id="scan-book-count">0 books found</span>
                </div>
                <button id="btn-scan-now" class="btn-scan-now" hidden>Scan</button>
            </div>
        </div>
        <div id="error-overlay" hidden role="alert">
            <div class="error-content">
                <p id="error-message"></p>
                <button id="btn-retry">Retry</button>
            </div>
        </div>
    `;
}

describe('ui', () => {
    let handlers: UIHandlers;

    beforeEach(() => {
        // Reset state to defaults
        update({
            books: [],
            isScanning: false,
            autoScan: true,
            scanCount: 0,
            lastDetectedText: '',
            error: null,
            view: 'home',
            isProcessingImage: false,
            ocrReady: false,
        });

        setupDOM();
        handlers = createHandlers();
        initUI(handlers);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('view switching', () => {
        it('shows home view by default', () => {
            expect(document.getElementById('home-view')!.hidden).toBe(false);
            expect(document.getElementById('scan-view')!.hidden).toBe(true);
        });

        it('shows scan view when state.view changes to scan', () => {
            update({ view: 'scan' });
            expect(document.getElementById('home-view')!.hidden).toBe(true);
            expect(document.getElementById('scan-view')!.hidden).toBe(false);
        });

        it('shows home view when state.view changes back', () => {
            update({ view: 'scan' });
            update({ view: 'home' });
            expect(document.getElementById('home-view')!.hidden).toBe(false);
            expect(document.getElementById('scan-view')!.hidden).toBe(true);
        });
    });

    describe('OCR status', () => {
        it('shows OCR loading indicator when not ready', () => {
            update({ ocrReady: false });
            expect(document.getElementById('ocr-status')!.hidden).toBe(false);
        });

        it('hides OCR loading indicator when ready', () => {
            update({ ocrReady: true });
            expect(document.getElementById('ocr-status')!.hidden).toBe(true);
        });
    });

    describe('button handlers', () => {
        it('calls onStartCamera when camera button clicked', () => {
            document.getElementById('btn-start-camera')!.click();
            expect(handlers.onStartCamera).toHaveBeenCalled();
        });

        it('calls onStopCamera when back button clicked', () => {
            document.getElementById('btn-back')!.click();
            expect(handlers.onStopCamera).toHaveBeenCalled();
        });

        it('calls onAutoScanToggle when toggle clicked', () => {
            document.getElementById('auto-scan-switch')!.click();
            expect(handlers.onAutoScanToggle).toHaveBeenCalled();
        });

        it('calls onManualScan when scan now button clicked', () => {
            document.getElementById('btn-scan-now')!.click();
            expect(handlers.onManualScan).toHaveBeenCalled();
        });

        it('calls onExport when export button clicked', () => {
            // Button starts disabled; add a book to enable it
            addBook(makeBook());
            document.getElementById('btn-home-export')!.click();
            expect(handlers.onExport).toHaveBeenCalled();
        });

        it('calls onClear when clear button clicked', () => {
            addBook(makeBook());
            document.getElementById('btn-home-clear')!.click();
            expect(handlers.onClear).toHaveBeenCalled();
        });

        it('calls onRetry when retry button clicked', () => {
            document.getElementById('btn-retry')!.click();
            expect(handlers.onRetry).toHaveBeenCalled();
        });

        it('opens file picker when upload button clicked', () => {
            const photoInput = document.getElementById('photo-input') as HTMLInputElement;
            const clickSpy = vi.spyOn(photoInput, 'click');
            document.getElementById('btn-upload-image')!.click();
            expect(clickSpy).toHaveBeenCalled();
        });
    });

    describe('auto-scan toggle UI', () => {
        it('shows toggle as on when autoScan is true', () => {
            update({ autoScan: true });
            const toggle = document.getElementById('auto-scan-switch')!;
            expect(toggle.getAttribute('aria-checked')).toBe('true');
            expect(toggle.classList.contains('toggle-on')).toBe(true);
        });

        it('shows toggle as off when autoScan is false', () => {
            update({ autoScan: false });
            const toggle = document.getElementById('auto-scan-switch')!;
            expect(toggle.getAttribute('aria-checked')).toBe('false');
            expect(toggle.classList.contains('toggle-on')).toBe(false);
        });

        it('shows scan-now button when autoScan is off', () => {
            update({ autoScan: false });
            expect(document.getElementById('btn-scan-now')!.hidden).toBe(false);
        });

        it('hides scan-now button when autoScan is on', () => {
            update({ autoScan: true });
            expect(document.getElementById('btn-scan-now')!.hidden).toBe(true);
        });
    });

    describe('home book list rendering', () => {
        it('shows empty state when no books', () => {
            const list = document.getElementById('home-book-list')!;
            expect(list.querySelector('.empty-state')).not.toBeNull();
            expect(list.textContent).toContain('No books found yet');
        });

        it('renders book cards when books exist', () => {
            addBook(makeBook({ id: 'b1', title: 'First Book' }));
            addBook(makeBook({ id: 'b2', title: 'Second Book' }));

            const list = document.getElementById('home-book-list')!;
            const cards = list.querySelectorAll('.book-card');
            expect(cards).toHaveLength(2);
        });

        it('renders book title, authors, ISBN', () => {
            addBook(makeBook({
                id: 'b1',
                title: 'My Book',
                authors: ['Alice', 'Bob'],
                isbn: '123',
            }));

            const list = document.getElementById('home-book-list')!;
            expect(list.textContent).toContain('My Book');
            expect(list.textContent).toContain('Alice, Bob');
            expect(list.textContent).toContain('ISBN: 123');
        });

        it('renders book links when infoLink provided', () => {
            addBook(makeBook({ id: 'b1', infoLink: 'https://example.com' }));
            const link = document.querySelector('.book-link') as HTMLAnchorElement;
            expect(link).not.toBeNull();
            expect(link.href).toContain('example.com');
        });

        it('updates book count text', () => {
            addBook(makeBook({ id: 'b1' }));
            expect(document.getElementById('home-book-count')!.textContent).toBe('1 book found');

            addBook(makeBook({ id: 'b2' }));
            expect(document.getElementById('home-book-count')!.textContent).toBe('2 books found');
        });

        it('enables export/clear buttons when books exist', () => {
            addBook(makeBook());
            expect((document.getElementById('btn-home-export') as HTMLButtonElement).disabled).toBe(false);
            expect((document.getElementById('btn-home-clear') as HTMLButtonElement).disabled).toBe(false);
        });

        it('disables export/clear buttons when no books', () => {
            expect((document.getElementById('btn-home-export') as HTMLButtonElement).disabled).toBe(true);
            expect((document.getElementById('btn-home-clear') as HTMLButtonElement).disabled).toBe(true);
        });
    });

    describe('scan view status', () => {
        it('shows scan count', () => {
            update({ scanCount: 42 });
            expect(document.getElementById('scan-count')!.textContent).toBe('Scans: 42');
        });

        it('shows scanning status when auto-scanning', () => {
            update({ isScanning: true, autoScan: true });
            expect(document.getElementById('scan-status')!.textContent).toBe('Auto-scanning');
        });

        it('shows manual status when scanning without auto', () => {
            update({ isScanning: true, autoScan: false });
            expect(document.getElementById('scan-status')!.textContent).toBe('Manual');
        });

        it('shows paused status when not scanning', () => {
            update({ isScanning: false });
            expect(document.getElementById('scan-status')!.textContent).toBe('Paused');
        });

        it('shows last detected text (truncated)', () => {
            update({ lastDetectedText: 'A'.repeat(100) });
            const text = document.getElementById('last-text')!.textContent!;
            expect(text.length).toBeLessThanOrEqual(63);
        });
    });

    describe('image processing state', () => {
        it('shows processing indicator when processing', () => {
            update({ isProcessingImage: true });
            expect(document.getElementById('home-processing')!.hidden).toBe(false);
        });

        it('hides processing indicator when done', () => {
            update({ isProcessingImage: false });
            expect(document.getElementById('home-processing')!.hidden).toBe(true);
        });

        it('disables action buttons during processing', () => {
            update({ isProcessingImage: true });
            expect((document.getElementById('btn-upload-image') as HTMLButtonElement).disabled).toBe(true);
            expect((document.getElementById('btn-start-camera') as HTMLButtonElement).disabled).toBe(true);
        });
    });

    describe('remove book (event delegation)', () => {
        it('calls onRemoveBook with correct index', () => {
            addBook(makeBook({ id: 'b1' }));
            addBook(makeBook({ id: 'b2' }));

            const removeBtn = document.querySelector('.btn-remove[data-index="1"]') as HTMLElement;
            expect(removeBtn).not.toBeNull();
            removeBtn.click();
            expect(handlers.onRemoveBook).toHaveBeenCalledWith(1);
        });
    });

    describe('error overlay', () => {
        it('shows error message', () => {
            showError('Something went wrong');
            expect(document.getElementById('error-overlay')!.hidden).toBe(false);
            expect(document.getElementById('error-message')!.textContent).toBe('Something went wrong');
        });

        it('hides error overlay', () => {
            showError('Error');
            hideError();
            expect(document.getElementById('error-overlay')!.hidden).toBe(true);
        });
    });
});
