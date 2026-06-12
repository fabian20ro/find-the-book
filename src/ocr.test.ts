import 'vitest-canvas-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TextRecognizer } from './ocr';

class MockCanvasContext {
    data = new Uint8ClampedArray(36);
    width = 3;
    height = 3;
    getImageData(x: number, y: number, w: number, h: number) {
        return {
            data: this.data,
            width: w,
            height: h
        };
    }
    createImageData(w: number, h: number) {
        return {
            data: new Uint8ClampedArray(w * h * 4),
            width: w,
            height: h
        };
    }
    putImageData = vi.fn((imageData: ImageData) => {
        this.data = imageData.data;
    });
}

const mockCtx = new MockCanvasContext();

describe('TextRecognizer', () => {
    let canvas: HTMLCanvasElement;

    beforeEach(() => {
        canvas = document.createElement('canvas');
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(mockCtx as any);

        const mockWorker = {
            recognize: vi.fn(),
            terminate: vi.fn(),
            setParameters: vi.fn().mockResolvedValue(undefined),
        };
        vi.stubGlobal('Tesseract', {
            createWorker: vi.fn().mockResolvedValue(mockWorker),
        });
    });

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
            const recognintizer = new TextRecognizer();
            await expect(recognintizer.init()).rejects.toThrow('Tesseract.js failed to load from CDN');
        });
    });

    describe('recognize', () => {
        it('returns text lines from OCR result', async () => {
            const mockRecognize = vi.fn();
            const mockWorker = {
                recognize: mockRecognize,
                terminate: vi.fn(),
                setParameters: vi.fn().mockResolvedValue(undefined),
            };
            vi.mocked(Tesseract.createWorker).mockResolvedValue(mockWorker as any);

            mockRecognize.mockResolvedValue({
                data: {
                    lines: [
                        { text: '  Hello World  ', confidence: 90 },
                        { text: 'Another Line', confidence: 80 },
                        { text: 'AB', confidence: 95 },
                    ],
                },
            });

            const recognizer = new TextRecognizer();
            await recognizer.init();

            const results = await recognizer.recognize(canvas);

            expect(results).toEqual([
                { text: 'Hello World', confidence: 90 },
                { text: 'Another Line', confidence: 80 },
            ]);
        });

        it('filters lines based on custom minLineLength and minLineConfidence', async () => {
            const mockRecognize = vi.fn();
            const mockWorker = {
                recognize: mockRecognize,
                terminate: vi.fn(),
                setParameters: vi.fn().mockResolvedValue(undefined),
            };
            vi.mocked(Tesseract.createWorker).mockResolvedValue(mockWorker as any);

            mockRecognize.mockResolvedValue({
                data: {
                    lines: [
                        { text: 'Hi', confidence: 90 },
                        { text: 'Valid', confidence: 10 },
                        { text: 'This is a long valid line', confidence: 95 },
                    ],
                },
            });

            const recognizer = new TextRecognizer();
            await recognizer.init('eng', { minLineLength: 3, minLineConfidence: 50 });

            const results = await recognizer.recognize(canvas);

            expect(results).toEqual([
                { text: 'This is a long valid line', confidence: 95 },
            ]);
        });

        it('returns empty array when already processing', async () => {
            let resolveOcr: (v: any) => void;
            const mockRecognize = vi.fn();
            mockRecognize.mockReturnValueOnce(new Promise((r) => { resolveOcr = r; }));
            const mockWorker = {
                recognize: mockRecognize,
                terminate: vi.fn(),
                setParameters: vi.fn().mockResolvedValue(undefined),
            };
            vi.mocked(Tesseract.createWorker).mockResolvedValue(mockWorker as any);

            const recognizer = new TextRecognizer();
            await recognizer.init();

            const firstCall = recognizer.recognize(canvas);
            const blocked = await recognizer.recognize(canvas);
            expect(blocked).toEqual([]);

            resolveOcr!({ data: { lines: [{ text: 'Done', confidence: 90 }] } });
            const result = await firstCall;
            expect(result).toEqual([{ text: 'Done', confidence: 90 }]);
        });

        it('throws if not initialized', async () => {
            const recognizer = new TextRecognizer();
            await expect(recognizer.recognize(canvas)).rejects.toThrow('TextRecognizer not initialized. Call init() first.');
        });

        it('handles OCR errors gracefully', async () => {
            const mockRecognize = vi.fn();
            mockRecognize.mockRejectedValue(new Error('OCR failed'));
            const mockWorker = {
                recognize: mockRecognize,
                terminate: vi.fn(),
                setParameters: vi.fn().mockResolvedValue(undefined),
            };
            vi.mocked(Tesseract.createWorker).mockResolvedValue(mockWorker as any);

            const recognizer = new TextRecognizer();
            await recognizer.init();
            const results = await recognizer.recognize(canvas);
            expect(results).toEqual([]);
        });

        it('handles empty lines array', async () => {
            const mockRecognize = vi.fn();
            mockRecognize.mockResolvedValue({ data: { lines: [] } });
            const mockWorker = {
                recognize: mockRecognize,
                terminate: vi.fn(),
                setParameters: vi.fn().mockResolvedValue(undefined),
            };
            vi.mocked(Tesseract.createWorker).mockResolvedValue(mockWorker as any);

            const recognizer = new TextRecognizer();
            await recognizer.init();
            const results = await recognizer.recognize(canvas);
            expect(results).toEqual([]);
        });

        it('handles missing lines in response', async () => {
            const mockRecognize = vi.fn();
            mockRecognize.mockResolvedValue({ data: {} });
            const mockWorker = {
                recognize: mockRecognize,
                terminate: vi.fn(),
                setParameters: vi.fn().mockResolvedValue(undefined),
            };
            vi.mocked(Tesseract.createWorker).mockResolvedValue(mockWorker as any);

            const recognizer = new TextRecognizer();
            await recognizer.init();
            const results = await recognizer.recognize(canvas);
            expect(results).toEqual([]);
        });
    });

    describe('resetProcessing', () => {
        it('allows new recognition after reset', async () => {
            let resolveOcr: (v: any) => void;
            const mockRecognize = vi.fn();
            mockRecognize.mockReturnValueOnce(new Promise((r) => { resolveOcr = r; }));
            const mockWorker = {
                recognize: mockRecognize,
                terminate: vi.fn(),
                setParameters: vi.fn().mockResolvedValue(undefined),
            };
            vi.mocked(Tesseract.createWorker).mockResolvedValue(mockWorker as any);

            const recognizer = new TextRecognizer();
            await recognizer.init();

            recognizer.recognize(canvas);
            const blocked = await recognizer.recognize(canvas);
            expect(blocked).toEqual([]);

            recognizer.resetProcessing();

            mockRecognize.mockResolvedValueOnce({ data: { lines: [{ text: 'After reset', confidence: 85 }] } });
            const result = await recognizer.recognize(canvas);
            expect(result).toEqual([{ text: 'After reset', confidence: 85 }]);

            resolveOcr!({ data: { lines: [] } });
        });
    });

    describe('setLanguage', () => {
        it('rolls back currentLang if setting language fails', async () => {
            const recognizer = new TextRecognizer();
            await recognizer.init('ron');
            expect(recognizer.getLanguage()).toBe('ron');

            vi.mocked(Tesseract.createWorker).mockRejectedValueOnce(new Error('Worker creation failed'));

            await expect(recognizer.setLanguage('eng')).rejects.toThrow('Worker creation failed');
            expect(recognizer.getLanguage()).toBe('ron');
        });

        it('keeps the previous worker available if switching languages fails', async () => {
            const mockWorker = {
                recognize: vi.fn(),
                terminate: vi.fn(),
                setParameters: vi.fn().mockResolvedValue(undefined),
            };
            vi.mocked(Tesseract.createWorker)
                .mockResolvedValueOnce(mockWorker)
                .mockRejectedValueOnce(new Error('language download failed'));

            const recognizer = new TextRecognizer();
            await recognizer.init();

            await expect(recognizer.setLanguage('eng')).rejects.toThrow('language download failed');
            expect(mockWorker.terminate).not.toHaveBeenCalled();
            expect(recognizer.getLanguage()).toBe('ron');

            const results = await recognizer.recognize(canvas);
            expect(results).toEqual([]);
        });

        it('skips if already using the same language', async () => {
            const recognizer = new TextRecognizer();
            await recognizer.init('fra');
            const callCount = (Tesseract.createWorker as any).mock.calls.length;
            await recognizer.setLanguage('fra');
            expect((Tesseract.createWorker as any).mock.calls.length).toBe(callCount);
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
            const mockWorker = {
                recognize: vi.fn(),
                terminate: vi.fn(),
                setParameters: vi.fn().mockResolvedValue(undefined),
            };
            vi.mocked(Tesseract.createWorker).mockResolvedValue(mockWorker as any);
            const recognizer = new TextRecognizer();
            await recognizer.init();
            await recognizer.destroy();
            expect(mockWorker.terminate).toHaveBeenCalled();
        });

        it('is safe to call when not initialized', async () => {
            const recognizer = new TextRecognizer();
            await recognizer.destroy();
        });
    });
});

import { preprocessCanvas, frameBrightness } from './ocr';

describe('ocr utilities', () => {
    let canvas: HTMLCanvasElement;
    let mockCtx: any;

    beforeEach(() => {
        canvas = document.createElement('canvas');
        mockCtx = new MockCanvasContext();
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(mockCtx as any);
    });

    describe('preprocessCanvas', () => {
        it('returns the same canvas if context is null', () => {
            vi.spyOn(canvas, 'getContext').mockReturnValue(null);
            const result = preprocessCanvas(canvas);
            expect(result).toBe(canvas);
        });

        it('performs grayscale, contrast stretch and sharpening correctly', () => {
            canvas.width = 3;
            canvas.height = 3;
            const imageData = new ImageData(new Uint8ClampedArray([
                255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
                128, 128, 128, 255, 128, 128, 128, 255, 128, 128, 128, 255,
                0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255
            ]), 3, 3);
            mockCtx.putImageData(imageData);
            const result = preprocessCanvas(canvas, 0.5);
            expect(result).toBeInstanceOf(HTMLCanvasElement);
            expect(mockCtx.putImageData).toHaveBeenCalled();
            const outData = mockCtx.putImageData.mock.calls[0][0].data;
            expect(outData[16]).toBeCloseTo(128, 0); 
            expect(outData[17]).toBeCloseTo(128, 0); 
            expect(outData[18]).toBeCloseTo(128, 0); 
        });
    });

    describe('frameBrightness', () => {
        it('calculates average brightness correctly', () => {
            canvas.width = 2;
            canvas.height = 2;
            const ctx = canvas.getContext('2d')!;
            ctx.putImageData(new ImageData(new Uint8ClampedArray([
                255, 255, 255, 255,
                0, 0, 0, 255,
                128, 128, 128, 255,
                64, 64, 64, 255
            ]), 2, 2), 0, 0);
            const brightness = frameBrightness(canvas);
            expect(brightness).toBeCloseTo(147.56, 1);
        });
    });
});
