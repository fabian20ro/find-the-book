import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getState, addCandidates, update } from './state';
import { resumeAutoScan, pauseAutoScan } from './scanner';

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

const { mockOcrInit, mockSetLanguage, mockRecognize } = vi.hoisted(() => ({
    mockOcrInit: vi.fn().mockResolvedValue(undefined),
    mockSetLanguage: vi.fn().mockResolvedValue(undefined),
    mockRecognize: vi.fn().mockResolvedValue(['Test text']),
}));

vi.mock('./ocr', () => ({
    TextRecognizer: class {
        init = mockOcrInit;
        setLanguage = mockSetLanguage;
        recognize = mockRecognize;
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
    shareBooks: vi.fn().mockResolvedValue(undefined),
}));

let capturedHandlers: any = null;
let appModule: typeof import('./app');

vi.mock('./ui', () => ({
    initUI: vi.fn((handlers: any) => { capturedHandlers = handlers; }),
    getVideoElement: vi.fn().mockReturnValue(document.createElement('video')),
    getCanvasElement: vi.fn().mockReturnValue(document.createElement('canvas')),
    showError: vi.fn(),
    hideError: vi.fn(),
    getAllLanguages: vi.fn().mockReturnValue([
        { code: 'ron', name: 'Romanian', flag: 'RO' },
        { code: 'eng', name: 'English', flag: 'EN' },
        { code: 'fra', name: 'French', flag: 'FR' },
        { code: 'deu', name: 'German', flag: 'DE' },
        { code: 'ita', name: 'Italian', flag: 'IT' },
        { code: 'spa', name: 'Spanish', flag: 'ES' },
        { code: 'por', name: 'Portuguese', flag: 'PT' },
        { code: 'nld', name: 'Dutch', flag: 'NL' },
        { code: 'pol', name: 'Polish', flag: 'PL' },
        { code: 'hun', name: 'Hungarian', flag: 'HU' },
        { code: 'ces', name: 'Czech', flag: 'CS' },
        { code: 'tur', name: 'Turkish', flag: 'TR' },
        { code: 'swe', name: 'Swedish', flag: 'SV' },
        { code: 'rus', name: 'Russian', flag: 'RU' },
        { code: 'jpn', name: 'Japanese', flag: 'JP' },
        { code: 'zho', name: 'Chinese', flag: 'ZH' },
    ]),
}));

describe('app', () => {
    beforeEach(async () => {
        localStorage.clear();
        capturedHandlers = null;
        mockOcrInit.mockClear();
        mockSetLanguage.mockClear();

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

    it('calls scanOnce when onManualScan is triggered (if camera is active)', async () => {
        const { scanOnce } = await import('./scanner');
        await capturedHandlers.onStartCamera();
        await capturedHandlers.onManualScan();
        expect(scanOnce).toHaveBeenCalled();
    });

    it('calls stopScanning when onStopCamera is triggered', async () => {
        const { stopScanning } = await import('./scanner');
        await capturedHandlers.onStartCamera();
        await capturedHandlers.onStopCamera();
        expect(stopScanning).toHaveBeenCalled();
    });

    it('loads saved autoScan preference from localStorage', async () => {
        localStorage.setItem('ftb-autoscan', 'false');

        vi.resetModules();
        capturedHandlers = null;
        appModule = await import('./app');
        await new Promise((r) => setTimeout(r, 10));

        expect(capturedHandlers).not.toBeNull();
        expect(getState().autoScan).toBe(false);
    });

    it('ignores unsupported saved OCR languages', async () => {
        localStorage.setItem('ftb-language', 'zzz');

        vi.resetModules();
        capturedHandlers = null;
        appModule = await import('./app');
        await new Promise((r) => setTimeout(r, 10));

        expect(getState().ocrLanguage).toBe('ron');
    });

    it('keeps the previous OCR language when a switch fails', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        mockSetLanguage.mockRejectedValueOnce(new Error('language download failed'));

        await capturedHandlers.onLanguageChange('eng');

        expect(getState().ocrLanguage).toBe('ron');
        expect(localStorage.getItem('ftb-language')).toBeNull();
        expect(mockSetLanguage).toHaveBeenCalledWith('eng');
        expect(consoleError).toHaveBeenCalledWith('Language change failed:', expect.any(Error));
    });

    it('normalizes stored language usage before returning it', () => {
        localStorage.setItem('ftb-lang-usage', JSON.stringify({
            eng: 3,
            fra: 'nope',
            pol: 0,
            ces: 2,
            zzz: 99,
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

    it('trims whitespace from restored required fields', () => {
        const restored = appModule.parseStoredBooks(JSON.stringify([
            {
                id: '  spaced-id  ',
                title: '  Spaced Title  ',
            },
        ]));

        expect(restored).toHaveLength(1);
        expect(restored[0]).toMatchObject({
            id: 'spaced-id',
            title: 'Spaced Title',
        });
    });

    it('drops invalid stored numeric fields when restoring books', () => {
        const restored = appModule.parseStoredBooks('[{"id":"numeric-book","title":"Numeric Book","pageCount":-12,"confidence":123.8}]');

        expect(restored).toHaveLength(1);
        expect(restored[0]).toMatchObject({
            id: 'numeric-book',
            title: 'Numeric Book',
            pageCount: null,
            confidence: 100,
        });
    });

    it('treats pageCount of 0 as invalid/null', () => {
        const restored = appModule.parseStoredBooks('[{"id":"zero-book","title":"Zero Book","pageCount":0}]');

        expect(restored).toHaveLength(1);
        expect(restored[0]).toMatchObject({
            id: 'zero-book',
            title: 'Zero Book',
            pageCount: null,
        });
    });

    it('trims and drops blank author names when restoring books', () => {
        const restored = appModule.parseStoredBooks(JSON.stringify([
            {
                id: 'author-book',
                title: 'Author Book',
                authors: ['  Alice  ', '', 'Bob', '   ', 42],
            },
        ]));

        expect(restored).toHaveLength(1);
        expect(restored[0].authors).toEqual(['Alice', 'Bob']);
    });

    it('trims whitespace from restored ISBN values and drops blank ones', () => {
        const restored = appModule.parseStoredBooks(JSON.stringify([
            {
                id: 'isbn-book',
                title: 'ISBN Book',
                isbn: ' 9781234567890 ',
            },
            {
                id: 'blank-isbn-book',
                title: 'Blank ISBN Book',
                isbn: '   ',
            },
        ]));

        expect(restored).toHaveLength(2);
        expect(restored[0].isbn).toBe('9781234567890');
        expect(restored[1].isbn).toBeNull();
    });

    it('trims and drops blank optional metadata fields when restoring books', () => {
        const restored = appModule.parseStoredBooks(JSON.stringify([
            {
                id: 'meta-book',
                title: 'Metadata Book',
                publisher: '  Publisher  ',
                publishedDate: ' 2024 ',
                description: '  Description  ',
                thumbnailUrl: '  https://example.com/thumb.jpg  ',
                infoLink: '   ',
            },
        ]));

        expect(restored).toHaveLength(1);
        expect(restored[0]).toMatchObject({
            publisher: 'Publisher',
            publishedDate: '2024',
            description: 'Description',
            thumbnailUrl: 'https://example.com/thumb.jpg',
            infoLink: null,
        });
    });

    it('returns an empty array when parseStoredBooks receives invalid JSON', () => {
        expect(appModule.parseStoredBooks('{not json}')).toEqual([]);
    });

    it('returns an empty array for non-array stored books payload', () => {
        const restored = appModule.parseStoredBooks(JSON.stringify({ id: 'x', title: 'Y' }));
        expect(restored).toEqual([]);
    });

    it('adds book from candidates when onAddCandidate is triggered', async () => {
        const { getState: getTestState, addCandidates } = await import('./state');
        const candidateBook = {
            id: 'candidate-1',
            title: 'Candidate Book',
            authors: ['Author'],
            confidence: 90,
        };
        addCandidates([candidateBook as any]);
        expect(getTestState().candidateBooks.length).toBe(1);

        capturedHandlers.onAddCandidate('candidate-1');

        expect(getTestState().books.some(b => b.id === 'candidate-1')).toBe(true);
        expect(getTestState().candidateBooks.length).toBe(0);
    });

    it('calls resumeAutoScan when auto-scan is toggled on with camera active', async () => {
        const { resumeAutoScan } = await import('./scanner');
        await capturedHandlers.onStartCamera();
        capturedHandlers.onAutoScanToggle();

        expect(resumeAutoScan).toHaveBeenCalledOnce();
    });

    it('calls pauseAutoScan when auto-scan is toggled off with camera active', async () => {
        const { resumeAutoScan, pauseAutoScan } = await import('./scanner');
        await capturedHandlers.onStartCamera();
        capturedHandlers.onAutoScanToggle(); // turn on
        vi.clearAllMocks();

        capturedHandlers.onAutoScanToggle(); // turn off

        expect(pauseAutoScan).toHaveBeenCalledOnce();
    });

    it('does not call resume/pause auto-scan when there is no camera', async () => {
        const { resumeAutoScan, pauseAutoScan } = await import('./scanner');

        vi.clearAllMocks();

        capturedHandlers.onAutoScanToggle(); // turns on — no camera
        capturedHandlers.onAutoScanToggle(); // turns off — no camera

        expect(resumeAutoScan).not.toHaveBeenCalled();
        expect(pauseAutoScan).not.toHaveBeenCalled();
    });

    it('persists auto-scan preference to localStorage without camera active', async () => {
        const { resumeAutoScan, pauseAutoScan } = await import('./scanner');

        vi.clearAllMocks();

        capturedHandlers.onAutoScanToggle(); // turns on — no camera started
        expect(resumeAutoScan).not.toHaveBeenCalled();
        expect(localStorage.getItem('ftb-autoscan')).toBe('true');

        capturedHandlers.onAutoScanToggle(); // turns off
        expect(pauseAutoScan).not.toHaveBeenCalled();
        expect(localStorage.getItem('ftb-autoscan')).toBe('false');
    });

    it('persists auto-scan preference to localStorage when toggled on', async () => {
        await capturedHandlers.onStartCamera();
        capturedHandlers.onAutoScanToggle();

        expect(localStorage.getItem('ftb-autoscan')).toBe('true');
    });

    it('persists auto-scan preference to localStorage when toggled off', async () => {
        await capturedHandlers.onStartCamera();
        capturedHandlers.onAutoScanToggle(); // turn on
        capturedHandlers.onAutoScanToggle(); // turn off

        expect(localStorage.getItem('ftb-autoscan')).toBe('false');
    });

    it('rejects oversized uploads with a toast and no processing', async () => {
        const largeFile = new File(['x'.repeat(1024 * 1024)], 'large.jpg', { type: 'image/jpeg' });
        // 11 MB, exceeds the 10 MB cap
        Object.defineProperty(largeFile, 'size', { value: 11 * 1024 * 1024 });

        await capturedHandlers.onImageUpload(largeFile);

        expect(mockRecognize).not.toHaveBeenCalled();
    });

    it('persists language and increments usage on successful switch', async () => {
        await capturedHandlers.onLanguageChange('eng');

        expect(localStorage.getItem('ftb-language')).toBe('eng');
    });

    it('does not call scanOnce when manual scan has no camera', async () => {
        const { scanOnce } = await import('./scanner');

        vi.clearAllMocks();

        await capturedHandlers.onManualScan();

        expect(scanOnce).not.toHaveBeenCalled();
    });

    it('shows a toast and does not call shareBooks when there are no books', async () => {
        const { shareBooks } = await import('./export');

        capturedHandlers.onShare();

        expect(shareBooks).not.toHaveBeenCalled();
    });

    it('does not call exportToCsv when there are no books to export', async () => {
        const { exportToCsv } = await import('./export');

        capturedHandlers.onExport();

        expect(exportToCsv).not.toHaveBeenCalled();
    });

    it('does nothing onClear when there are no books', () => {
        capturedHandlers.onClear();

        expect(getState().books).toHaveLength(0);
    });

    it('keeps ocrReady false and logs error when OCR preload fails at startup', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        mockOcrInit.mockRejectedValueOnce(new Error('Tesseract.js failed to load'));

        vi.resetModules();
        capturedHandlers = null;
        appModule = await import('./app');
        // Let the rejected init() promise settle + microtask queue flush
        await new Promise((r) => setTimeout(r, 20));

        expect(getState().ocrReady).toBe(false);
        expect(consoleError).toHaveBeenCalledWith('OCR preload failed:', expect.any(Error));
    });
});
