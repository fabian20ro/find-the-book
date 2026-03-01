import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TextRecognizer } from './ocr';

// Mock global Tesseract
const mockRecognize = vi.fn();
const mockTerminate = vi.fn();
const mockWorker = {
    recognize: mockRecognize,
    terminate: mockTerminate,
};

beforeEach(() => {
    vi.stubGlobal('Tesseract', {
        createWorker: vi.fn().mockResolvedValue(mockWorker),
    });
    mockRecognize.mockReset();
    mockTerminate.mockReset();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('TextRecognizer', () => {
    describe('init', () => {
        it('initializes Tesseract worker with default language', async () => {
            const recognizer = new TextRecognizer();
            await recognizer.init();
            expect(Tesseract.createWorker).toHaveBeenCalledWith('ron');
        });

        it('initializes Tesseract worker with specified language', async () => {
            const recognizer = new TextRecognizer();
            await recognizer.init('eng');
            expect(Tesseract.createWorker).toHaveBeenCalledWith('eng');
        });

        it('throws if Tesseract is not loaded', async () => {
            vi.stubGlobal('Tesseract', undefined);
            const recognizer = new TextRecognizer();
            await expect(recognizer.init()).rejects.toThrow('Tesseract.js failed to load from CDN');
        });
    });

    describe('recognize', () => {
        it('returns text lines from OCR result', async () => {
            mockRecognize.mockResolvedValue({
                data: {
                    lines: [
                        { text: '  Hello World  ' },
                        { text: 'Another Line' },
                        { text: 'AB' }, // too short, should be filtered
                    ],
                },
            });

            const recognizer = new TextRecognizer();
            await recognizer.init();

            const canvas = document.createElement('canvas');
            const results = await recognizer.recognize(canvas);

            expect(results).toEqual(['Hello World', 'Another Line']);
        });

        it('filters lines shorter than 3 chars', async () => {
            mockRecognize.mockResolvedValue({
                data: {
                    lines: [
                        { text: 'OK' },
                        { text: 'AB' },
                        { text: '' },
                    ],
                },
            });

            const recognizer = new TextRecognizer();
            await recognizer.init();
            const results = await recognizer.recognize(document.createElement('canvas'));
            expect(results).toEqual([]);
        });

        it('returns empty array when already processing', async () => {
            let resolveOcr: (v: any) => void;
            mockRecognize.mockReturnValue(new Promise((r) => { resolveOcr = r; }));

            const recognizer = new TextRecognizer();
            await recognizer.init();

            const canvas = document.createElement('canvas');
            const first = recognizer.recognize(canvas);

            // Second call while first is still processing
            const second = await recognizer.recognize(canvas);
            expect(second).toEqual([]);

            // Resolve first call
            resolveOcr!({ data: { lines: [{ text: 'Done' }] } });
            const firstResult = await first;
            expect(firstResult).toEqual(['Done']);
        });

        it('throws if not initialized', async () => {
            const recognizer = new TextRecognizer();
            await expect(recognizer.recognize(document.createElement('canvas')))
                .rejects.toThrow('TextRecognizer not initialized');
        });

        it('handles OCR errors gracefully', async () => {
            mockRecognize.mockRejectedValue(new Error('OCR failed'));

            const recognizer = new TextRecognizer();
            await recognizer.init();
            const results = await recognizer.recognize(document.createElement('canvas'));
            expect(results).toEqual([]);
        });

        it('handles empty lines array', async () => {
            mockRecognize.mockResolvedValue({ data: { lines: [] } });

            const recognizer = new TextRecognizer();
            await recognizer.init();
            const results = await recognizer.recognize(document.createElement('canvas'));
            expect(results).toEqual([]);
        });

        it('handles missing lines in response', async () => {
            mockRecognize.mockResolvedValue({ data: {} });

            const recognizer = new TextRecognizer();
            await recognizer.init();
            const results = await recognizer.recognize(document.createElement('canvas'));
            expect(results).toEqual([]);
        });
    });

    describe('resetProcessing', () => {
        it('allows new recognition after reset', async () => {
            let resolveOcr: (v: any) => void;
            mockRecognize.mockReturnValueOnce(new Promise((r) => { resolveOcr = r; }));

            const recognizer = new TextRecognizer();
            await recognizer.init();

            // Start a recognize call (puts it in processing state)
            const canvas = document.createElement('canvas');
            recognizer.recognize(canvas); // don't await

            // While processing, new calls would return []
            const blocked = await recognizer.recognize(canvas);
            expect(blocked).toEqual([]);

            // Reset processing flag
            recognizer.resetProcessing();

            // Now a new call should work
            mockRecognize.mockResolvedValueOnce({ data: { lines: [{ text: 'After reset' }] } });
            const afterReset = await recognizer.recognize(canvas);
            expect(afterReset).toEqual(['After reset']);

            // Clean up dangling promise
            resolveOcr!({ data: { lines: [] } });
        });
    });

    describe('setLanguage', () => {
        it('switches to a new language', async () => {
            const recognizer = new TextRecognizer();
            await recognizer.init();
            expect(recognizer.getLanguage()).toBe('ron');

            await recognizer.setLanguage('eng');
            expect(mockTerminate).toHaveBeenCalled();
            expect(Tesseract.createWorker).toHaveBeenCalledWith('eng');
            expect(recognizer.getLanguage()).toBe('eng');
        });

        it('skips if already using the same language', async () => {
            const recognizer = new TextRecognizer();
            await recognizer.init('fra');
            const callCount = (Tesseract.createWorker as any).mock.calls.length;

            await recognizer.setLanguage('fra');
            expect((Tesseract.createWorker as any).mock.calls.length).toBe(callCount);
            expect(mockTerminate).not.toHaveBeenCalled();
        });

        it('resets isProcessing flag', async () => {
            let resolveOcr: (v: any) => void;
            mockRecognize.mockReturnValueOnce(new Promise((r) => { resolveOcr = r; }));

            const recognizer = new TextRecognizer();
            await recognizer.init();
            const canvas = document.createElement('canvas');
            recognizer.recognize(canvas); // puts into processing state

            // Switching language should reset processing flag
            await recognizer.setLanguage('eng');

            mockRecognize.mockResolvedValueOnce({ data: { lines: [{ text: 'After switch' }] } });
            const result = await recognizer.recognize(canvas);
            expect(result).toEqual(['After switch']);

            // Clean up
            resolveOcr!({ data: { lines: [] } });
        });
    });

    describe('getLanguage', () => {
        it('returns the current language', async () => {
            const recognizer = new TextRecognizer();
            await recognizer.init('deu');
            expect(recognizer.getLanguage()).toBe('deu');
        });
    });

    describe('destroy', () => {
        it('terminates the worker', async () => {
            const recognizer = new TextRecognizer();
            await recognizer.init();
            await recognizer.destroy();
            expect(mockTerminate).toHaveBeenCalled();
        });

        it('is safe to call when not initialized', async () => {
            const recognizer = new TextRecognizer();
            await recognizer.destroy(); // should not throw
        });
    });
});
