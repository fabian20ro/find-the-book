import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock style import
vi.mock('./style.css', () => ({}));

// Mock all heavy dependencies before importing app
vi.mock('./camera', () => ({
    CameraManager: class {
        start = vi.fn().mockResolvedValue(undefined);
        stop = vi.fn();
        captureFrame = vi.fn().mockReturnValue(document.createElement('canvas'));
    },
}));

const mockOcrInit = vi.fn().mockResolvedValue(undefined);

vi.mock('./ocr', () => ({
    TextRecognizer: class {
        init = mockOcrInit;
        recognize = vi.fn().mockResolvedValue(['Test text']);
        resetProcessing = vi.fn();
        destroy = vi.fn();
    },
}));

vi.mock('./books', () => ({
    BookSearcher: class {
        search = vi.fn().mockResolvedValue([]);
        preloadBookId = vi.fn();
        removeBookId = vi.fn();
        clear = vi.fn();
    },
}));

vi.mock('./scanner', () => ({
    startScanning: vi.fn(),
    stopScanning: vi.fn(),
    scanOnce: vi.fn().mockResolvedValue(undefined),
    resumeAutoScan: vi.fn(),
    pauseAutoScan: vi.fn(),
}));

vi.mock('./export', () => ({
    exportToCsv: vi.fn(),
}));

let capturedHandlers: any = null;
let appModule: typeof import('./app');

vi.mock('./ui', () => ({
    initUI: vi.fn((handlers: any) => { capturedHandlers = handlers; }),
    getVideoElement: vi.fn().mockReturnValue(document.createElement('video')),
    getCanvasElement: vi.fn().mockReturnValue(document.createElement('canvas')),
    showError: vi.fn(),
    hideError: vi.fn(),
}));

describe('app', () => {
    beforeEach(async () => {
        localStorage.clear();
        capturedHandlers = null;
        mockOcrInit.mockClear();

        // Stub service worker
        Object.defineProperty(navigator, 'serviceWorker', {
            value: { register: vi.fn().mockResolvedValue(undefined) },
            configurable: true,
        });

        vi.resetModules();
        appModule = await import('./app');
        // Let microtasks (like OCR init promise) flush
        await new Promise((r) => setTimeout(r, 10));
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('calls initUI with all required handler keys', () => {
        expect(capturedHandlers).not.toBeNull();
        expect(capturedHandlers).toHaveProperty('onStartCamera');
        expect(capturedHandlers).toHaveProperty('onStopCamera');
        expect(capturedHandlers).toHaveProperty('onAutoScanToggle');
        expect(capturedHandlers).toHaveProperty('onManualScan');
        expect(capturedHandlers).toHaveProperty('onImageUpload');
        expect(capturedHandlers).toHaveProperty('onShare');
        expect(capturedHandlers).toHaveProperty('onExport');
        expect(capturedHandlers).toHaveProperty('onClear');
        expect(capturedHandlers).toHaveProperty('onRetry');
        expect(capturedHandlers).toHaveProperty('onRemoveBook');
    });

    it('initializes OCR engine on startup', () => {
        expect(mockOcrInit).toHaveBeenCalled();
    });

    it('all handlers are callable functions', () => {
        for (const key of ['onStartCamera', 'onStopCamera', 'onAutoScanToggle',
            'onManualScan', 'onImageUpload', 'onShare', 'onExport', 'onClear', 'onRetry', 'onRemoveBook']) {
            expect(typeof capturedHandlers[key]).toBe('function');
        }
    });

    it('loads saved autoScan preference from localStorage', async () => {
        localStorage.setItem('ftb-autoscan', 'false');

        vi.resetModules();
        capturedHandlers = null;
        appModule = await import('./app');
        await new Promise((r) => setTimeout(r, 10));

        expect(capturedHandlers).not.toBeNull();
    });

    it('normalizes stored language usage before returning it', () => {
        localStorage.setItem('ftb-lang-usage', JSON.stringify({
            eng: 3,
            fra: 'nope',
            pol: 0,
            ces: 2,
        }));

        expect(appModule.getLanguageUsage()).toEqual({
            eng: 3,
            ces: 2,
        });
    });

    it('returns an empty language usage map for malformed storage', () => {
        localStorage.setItem('ftb-lang-usage', '{not-json');

        expect(appModule.getLanguageUsage()).toEqual({});
    });

    it('restores only well-formed saved books from storage', () => {
        const restored = appModule.parseStoredBooks(JSON.stringify([
            {
                id: 'good-book',
                title: 'Saved Book',
                authors: ['Author A'],
                publisher: 'Publisher',
                publishedDate: '2024',
                description: 'Stored book',
                isbn: '9780000000000',
                pageCount: 123,
                thumbnailUrl: 'https://example.com/thumb.jpg',
                infoLink: 'https://example.com/info',
                confidence: 84,
            },
            { id: 42, title: 'Broken entry' },
            null,
        ]));

        expect(restored).toHaveLength(1);
        expect(restored[0]).toMatchObject({
            id: 'good-book',
            title: 'Saved Book',
            confidence: 84,
        });
    });

    it('drops books with blank required fields when restoring from storage', () => {
        const restored = appModule.parseStoredBooks(JSON.stringify([
            { id: '', title: 'Blank id' },
            { id: 'blank-title', title: '   ' },
            { id: 'good-book', title: 'Kept Book' },
        ]));

        expect(restored).toHaveLength(1);
        expect(restored[0]).toMatchObject({
            id: 'good-book',
            title: 'Kept Book',
        });
    });

    it('drops non-finite stored numeric fields when restoring books', () => {
        const restored = appModule.parseStoredBooks('[{"id":"numeric-book","title":"Numeric Book","pageCount":1e999,"confidence":-1e999}]');

        expect(restored).toHaveLength(1);
        expect(restored[0]).toMatchObject({
            id: 'numeric-book',
            title: 'Numeric Book',
            pageCount: null,
            confidence: 0,
        });
    });
});
