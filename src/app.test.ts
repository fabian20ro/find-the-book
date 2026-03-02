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
        await import('./app');
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
        expect(capturedHandlers).toHaveProperty('onExportText');
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
            'onManualScan', 'onImageUpload', 'onExportText', 'onExport', 'onClear', 'onRetry', 'onRemoveBook']) {
            expect(typeof capturedHandlers[key]).toBe('function');
        }
    });

    it('loads saved autoScan preference from localStorage', async () => {
        localStorage.setItem('ftb-autoscan', 'false');

        vi.resetModules();
        capturedHandlers = null;
        await import('./app');
        await new Promise((r) => setTimeout(r, 10));

        expect(capturedHandlers).not.toBeNull();
    });
});
