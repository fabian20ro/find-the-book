import 'vitest-canvas-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TextRecognizer, preprocessCanvas, LANG_WHITELISTS } from './ocr';

class MockCanvasContext {
    data = new Uint8ClampedArray(36);
    width = 3;
    height = 3;
    getImageData(x: number, y: number, w: number, h: number) {
        return {
            data: this.data,
            width: w,
            height: h,
            colorSpace: 'srgb'
        } as ImageData;
    }
    createImageData(w: number, h: number) {
        return {
            data: new Uint8ClampedArray(w * h * 4),
            width: w,
            height: h,
            colorSpace: 'srgb'
        } as ImageData;
    }
    putImageData = vi.fn((imageData: ImageData) => {
        this.data = imageData.data;
    });
    fillRect = vi.fn();
    strokeRect = vi.fn();
    clearRect = vi.fn();
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

        it('throws if Textesseract is not loaded', async () => {
            vi.stubGlobal('Tesseract', undefined);
            const recognintizer = new TextRecognizer();
            await expect(recognintizer.init()).rejects.toThrow('Tesseract.js failed to load from CDN');
        });

        it('throws if recognize is called before init', async () => {
            const recognizer = new TextRecognizer();
            const canvas = document.createElement('canvas');
            await expect(recognizer.recognize(canvas)).rejects.toThrow('TextRecognizer not initialized. Call init() first.');
        });

        it('throws if verifyReadiness is called when busy', async () => {
            const mockWorker = {
                recognize: vi.fn().mockReturnValue(new Promise((_, reject) => setTimeout(() => reject(new Error('mocked')), 10))),
                terminate: vi.fn(),
                setParameters: vi.fn().mockResolvedValue(undefined),
            };
            vi.mocked(Tesseract.createWorker).mockResolvedValue(mockWorker as any);

            const recognizer = new TextRecognizer();
            await recognizer.init();
            
            const recognizePromise = recognizer.recognize(document.createElement('canvas'));
            
            await expect(recognizer.verifyReadiness()).rejects.toThrow('TextRecognizer is busy.');
            
            try { await recognizePromise; } catch {}
            await recognizer.destroy();
        });

        it('destroys the worker on destroy', async () => {
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
    });

    describe('setLanguage', () => {
        it('throws if an invalid language is provided', async () => {
            const recognizer = new TextRecognizer();
            await recognizer.init('ron');
            await expect(recognizer.setLanguage('invalid-lang')).rejects.toThrow('Unsupported language: invalid-lang');
        });

        it('successfully sets language to an existing one', async () => {
            const mockWorker = {
                recognize: vi.fn(),
                terminate: vi.fn(),
                setParameters: vi.fn().mockResolvedValue(undefined),
            };
            const mockRecognize = vi.fn();
            mockWorker.recognize = mockRecognize;
            vi.mocked(Tesseract.createWorker).mockResolvedValue(mockWorker as any);

            const recognizer = new TextRecognizer();
            await recognizer.init('ron');
            await recognizer.setLanguage('eng');
            expect(recognizer.getLanguage()).toBe('eng');
            expect(mockWorker.setParameters).toHaveBeenCalledWith({ whitelist: LANG_WHITELISTS['eng'] });
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
                        { text: 'H', confidence: 90 },
                        { text: 'Valid Line', confidence: 80 },
                        { text: 'Too Low Confidence', confidence: 10 },
                    ],
                },
            });

            const recognizer = new TextRecognizer();
            await recognizer.init('ron', { minLineLength: 3, minLineConfidence: 50 });

            const results = await recognizer.recognize(canvas);

            expect(results).toEqual([
                { text: 'Valid Line', confidence: 80 },
            ]);
        });
    });
});

describe('preprocessCanvas', () => {
    let canvas: HTMLCanvasElement;
    let ctx: CanvasRenderingContext2D;

    beforeEach(() => {
        canvas = document.createElement('canvas');
        canvas.width = 3;
        canvas.height = 3;
        ctx = canvas.getContext('2d')!;
        mockCtx.data.fill(0);
    });

    it('correctly performs contrast stretch', () => {
        // Setup: Low contrast grayscale image
        // Grayscale values (0-255): 100, 110, 120, 130, 140, 150, 160, 170, 180
        const data = new Uint8ClampedArray([
            100, 100, 100, 255,
            110, 110, 110, 255,
            120, 120, 120, 255,
            130, 130, 130, 255,
            140, 140, 140, 255,
            150, 150, 150, 255,
            160, 160, 160, 255,
            170, 170, 170, 255,
            180, 180, 180, 255,
        ]);
        ctx.putImageData({ data: new Uint8ClampedArray(data), width: 3, height: 3, colorSpace: 'srgb' } as ImageData, 0, 0);

        const result = preprocessCanvas(canvas);
        const resultData = ctx.getImageData(0, 0, 3, 3).data;

        // 1st pixel: index 0, grayscale 100. Stretched 0.
        expect(resultData[0]).toBe(0);
        // 9th pixel: index 32, grayscale 180. Stretched 255.
        expect(resultData[32]).toBe(255);
        // 4th pixel: index 12, grayscale 130. Stretched (130-100)*3.1875 = 30*3.1875 = 95.625 -> 95.
        expect(resultData[12]).toBe(96);
    });

    it('performs sharpening on a blocky edge', () => {
        const data = new Uint8ClampedArray([
            150, 150, 150, 255,
            150, 100, 150, 255,
            150, 150, 150, 255,
        ]);
        const largeCanvas = document.createElement('canvas');
        largeCanvas.width = 5;
        largeCanvas.height = 5;
        const largeCtx = largeCanvas.getContext('2d')!;
        const largeData = new Uint8ClampedArray(5 * 5 * 4);
        for (let i = 0; i < largeData.length; i++) {
            largeData[i] = 100;
        }
        const idx = (2 * 5 + 2) * 4;
        largeData[idx] = 200;
        largeData[idx+1] = 200;
        largeData[idx+2] = 200;
        largeData[idx+3] = 255;
        largeCtx.putImageData({ data: new Uint8ClampedArray(largeData), width: 5, height: 5, colorSpace: 'srgb' } as ImageData, 0, 0);

        const result = preprocessCanvas(largeCanvas, 0.5);
        const resultData = largeCtx.getImageData(0, 0, 5, 5).data;

        expect(resultData[idx]).toBeGreaterThan(200);
    });
    
    it('handles a single-color canvas without error', () => {
        const data = new Uint8ClampedArray(36).fill(128);
        ctx.putImageData({ data: new Uint8ClampedArray(data), width: 3, height: 3, colorSpace: 'srgb' } as ImageData, 0, 0);
        const result = preprocessCanvas(canvas);
        expect(result.getContext('2d')?.getImageData(0, 0, 3, 3).data[0]).toBe(128);
    });
});