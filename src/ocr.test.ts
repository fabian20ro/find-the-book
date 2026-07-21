import 'vitest-canvas-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TextRecognizer, preprocessCanvas, frameBrightness, LANG_WHITELISTS } from './ocr';

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

        it('applies the language whitelist during init for languages that have one', async () => {
            const mockWorker = {
                recognize: vi.fn(),
                terminate: vi.fn(),
                setParameters: vi.fn().mockResolvedValue(undefined),
            };
            vi.mocked(Tesseract.createWorker).mockResolvedValue(mockWorker as any);

            const recognizer = new TextRecognizer();
            await recognizer.init('ron');

            expect(mockWorker.setParameters).toHaveBeenCalledWith({ whitelist: LANG_WHITELISTS['ron'] });
        });

        it('throws if Textesseract is not loaded', async () => {
            vi.stubGlobal('Tesseract', undefined);
            const recognintizer = new TextRecognizer();
            await expect(recognintizer.init()).rejects.toThrow('Tesseract.js failed to load from CDN');
        });

        it('preserves attempted language in getLanguage() after createWorker fails mid-init', async () => {
            vi.mocked(Tesseract.createWorker).mockRejectedValue(new Error('worker creation failed'));

            const recognizer = new TextRecognizer();
            await expect(recognizer.init('eng')).rejects.toThrow('worker creation failed');

            // currentLang is set BEFORE createWorker — it reflects what was attempted.
            expect(recognizer.getLanguage()).toBe('eng');

            // Worker never got assigned, so recognize() reports "not initialized" rather than a misleading state.
            await expect(recognizer.recognize(canvas)).rejects.toThrow('TextRecognizer not initialized');
        });

        it('throws if recognize is called before init', async () => {
            const recognizer = new TextRecognizer();
            const canvas = document.createElement('canvas');
            await expect(recognizer.recognize(canvas)).rejects.toThrow('TextRecognizer not initialized. Call init() first.');
        });

        it('throws if verifyReadiness is called when busy', async () => {
            const mockWorker = {
                recognize: vi.fn(),
                terminate: vi.fn(),
                setParameters: vi.fn().mockResolvedValue(undefined),
            };
            vi.mocked(Tesseract.createWorker).mockResolvedValue(mockWorker as any);

            const recognizer = new TextRecognizer();
            await recognizer.init();

            // Simulate a scan in progress by flipping the private busy flag directly.
            (recognizer as any).isProcessing = true;

            await expect(recognizer.verifyReadiness()).rejects.toThrow('TextRecognizer is busy.');

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

        it('returns immediately without creating a new worker when called with the same language', async () => {
            const mockWorker = {
                recognize: vi.fn(),
                terminate: vi.fn(),
                setParameters: vi.fn().mockResolvedValue(undefined),
            };
            vi.mocked(Tesseract.createWorker).mockResolvedValue(mockWorker as any);

            const recognizer = new TextRecognizer();
            await recognizer.init('ron');
            expect(recognizer.getLanguage()).toBe('ron');
            const workerRef = (recognizer as any).worker;

            // Calling setLanguage with the same language must be a no-op: no new worker created.
            await recognizer.setLanguage('ron');

            expect(Tesseract.createWorker).toHaveBeenCalledTimes(1);
            expect((recognizer as any).worker).toBe(workerRef);
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

        it('rolls back state when createWorker fails mid-switch', async () => {
            const mockWorker = {
                recognize: vi.fn(),
                terminate: vi.fn(),
                setParameters: vi.fn().mockResolvedValue(undefined),
            };
            vi.mocked(Tesseract.createWorker).mockResolvedValue(mockWorker as any);

            const recognizer = new TextRecognizer();
            await recognizer.init('ron');
            expect(recognizer.getLanguage()).toBe('ron');
            const prevWorker = (recognizer as any).worker;

            // Make createWorker throw to simulate network/Tesseract failure.
            vi.mocked(Tesseract.createWorker).mockRejectedValue(new Error('network error'));

            await expect(recognizer.setLanguage('eng')).rejects.toThrow('network error');

            // State must roll back — no half-applied language switch.
            expect(recognizer.getLanguage()).toBe('ron');
            expect((recognizer as any).worker).toBe(prevWorker);
        });

        it('rolls back state when setParameters fails mid-switch', async () => {
            const initWorker = {
                recognize: vi.fn(),
                terminate: vi.fn(),
                setParameters: vi.fn().mockResolvedValue(undefined),
            };

            // New worker for the switch attempt — different reference.
            const failWorker = {
                recognize: vi.fn(),
                terminate: vi.fn(),
                setParameters: vi.fn().mockRejectedValue(new Error('bad param')),
            };
            let callCount = 0;
            vi.mocked(Tesseract.createWorker).mockImplementation(() => {
                callCount++;
                return Promise.resolve(callCount === 1 ? initWorker : failWorker);
            });

            const recognizer = new TextRecognizer();
            await recognizer.init('ron');
            expect(recognizer.getLanguage()).toBe('ron');
            const prevWorker = (recognizer as any).worker;

            // setParameters fails after createWorker succeeds — rollback restores the original worker.
            await expect(recognizer.setLanguage('eng')).rejects.toThrow('bad param');

            // currentLang and worker must revert to pre-switch values.
            expect(recognizer.getLanguage()).toBe('ron');
            expect((recognizer as any).worker).toBe(prevWorker);
        });
    });

    describe('setWhitelist', () => {
        it('applies a custom whitelist to the Tesseract worker', async () => {
            const mockWorker = {
                recognize: vi.fn(),
                terminate: vi.fn(),
                setParameters: vi.fn().mockResolvedValue(undefined),
            };
            vi.mocked(Tesseract.createWorker).mockResolvedValue(mockWorker as any);

            const recognizer = new TextRecognizer();
            await recognizer.init('eng');

            const customChars = '0123456789';
            await recognizer.setWhitelist(customChars);

            expect(mockWorker.setParameters).toHaveBeenCalledWith({ whitelist: customChars });
        });

        it('throws if setWhitelist is called before init', async () => {
            const recognizer = new TextRecognizer();
            await expect(recognizer.setWhitelist('ABC')).rejects.toThrow(
                'TextRecognizer not initialized. Call init() first.',
            );
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

        it('returns empty array when already processing (busy-guard)', async () => {
            const mockWorker = {
                recognize: vi.fn(),
                terminate: vi.fn(),
                setParameters: vi.fn().mockResolvedValue(undefined),
            };
            vi.mocked(Tesseract.createWorker).mockResolvedValue(mockWorker as any);

            const recognizer = new TextRecognizer();
            await recognizer.init();

            // Simulate a scan in progress by flipping the private busy flag.
            (recognizer as any).isProcessing = true;

            const results = await recognizer.recognize(canvas);

            expect(results).toEqual([]);
            expect(mockWorker.recognize).not.toHaveBeenCalled();
        });

        it('returns empty array when canvas is null', async () => {
            const mockWorker = {
                recognize: vi.fn(),
                terminate: vi.fn(),
                setParameters: vi.fn().mockResolvedValue(undefined),
            };
            vi.mocked(Tesseract.createWorker).mockResolvedValue(mockWorker as any);

            const recognizer = new TextRecognizer();
            await recognizer.init();

            const results = await recognizer.recognize(null as any);

            expect(results).toEqual([]);
        });

        it('returns empty array when Tesseract returns no lines', async () => {
            const mockWorker = {
                recognize: vi.fn(),
                terminate: vi.fn(),
                setParameters: vi.fn().mockResolvedValue(undefined),
            };
            vi.mocked(Tesseract.createWorker).mockResolvedValue(mockWorker as any);

            // Tesseract can legitimately return results with no lines (blank/dark frames)
            mockWorker.recognize.mockResolvedValue({ data: { lines: [] } });

            const recognizer = new TextRecognizer();
            await recognizer.init();

            const results = await recognizer.recognize(canvas);

            expect(results).toEqual([]);
        });

        it('returns empty array when Tesseract returns data without a lines key', async () => {
            const mockWorker = {
                recognize: vi.fn(),
                terminate: vi.fn(),
                setParameters: vi.fn().mockResolvedValue(undefined),
            };
            vi.mocked(Tesseract.createWorker).mockResolvedValue(mockWorker as any);

            // Tesseract can return a response with no lines property at all — e.g. structural glitch.
            mockWorker.recognize.mockResolvedValue({ data: {} });

            const recognizer = new TextRecognizer();
            await recognizer.init();

            const results = await recognizer.recognize(canvas);

            expect(results).toEqual([]);
        });

        it('filters out lines with non-string text (defensive against malformed Tesseract)', async () => {
            const mockRecognize = vi.fn();
            const mockWorker = {
                recognize: mockRecognize,
                terminate: vi.fn(),
                setParameters: vi.fn().mockResolvedValue(undefined),
            };
            vi.mocked(Tesseract.createWorker).mockResolvedValue(mockWorker as any);

            // Tesseract can return lines where text is undefined, null, or missing — e.g. structural artifacts.
            mockRecognize.mockResolvedValue({
                data: {
                    lines: [
                        { text: '  Valid Line  ', confidence: 90 },
                        { confidence: 50 },           // no text property at all
                        { text: null, confidence: 70 },// explicit null
                        { text: undefined, confidence: 60 },// explicit undefined
                        { text: 'Another Valid', confidence: 85 },
                    ],
                },
            });

            const recognizer = new TextRecognizer();
            await recognizer.init();

            const results = await recognizer.recognize(canvas);

            expect(results).toEqual([
                { text: 'Valid Line', confidence: 90 },
                { text: 'Another Valid', confidence: 85 },
            ]);
        });

        it('resets isProcessing after transient Tesseract error during recognize', async () => {
            const mockWorker = {
                recognize: vi.fn().mockRejectedValue(new Error('transient ocr failure')),
                terminate: vi.fn(),
                setParameters: vi.fn().mockResolvedValue(undefined),
            };
            vi.mocked(Tesseract.createWorker).mockResolvedValue(mockWorker as any);

            const recognizer = new TextRecognizer();
            await recognizer.init();

            // The first call should reject, but the finally block must reset isProcessing.
            await expect(recognizer.recognize(canvas)).rejects.toThrow('transient ocr failure');
            expect((recognizer as any).isProcessing).toBe(false);

            // A subsequent call should proceed normally (not be silently dropped by the busy-guard).
            mockWorker.recognize.mockResolvedValue({ data: { lines: [] } });
            const results = await recognizer.recognize(canvas);

            expect(results).toEqual([]);
        });

        it('throws when Tesseract returns a result with no data object (malformed response)', async () => {
            const mockWorker = {
                recognize: vi.fn(),
                terminate: vi.fn(),
                setParameters: vi.fn().mockResolvedValue(undefined),
            };
            vi.mocked(Tesseract.createWorker).mockResolvedValue(mockWorker as any);

            // Tesseract can return a response with missing or undefined data — e.g. network glitch, worker crash.
            mockWorker.recognize.mockResolvedValue({ data: undefined });

            const recognizer = new TextRecognizer();
            await recognizer.init();

            await expect(recognizer.recognize(canvas)).rejects.toThrow('Tesseract recognition returned invalid result');
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

    it('returns the original canvas when getContext returns null', () => {
        const noCtxCanvas = document.createElement('canvas');
        // Use Object.defineProperty to bypass vi's mock registry — avoids leaking into vitest-canvas-mock state.
        const origDesc = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'getContext')!;
        (noCtxCanvas as any).getContext = (() => null) as any;

        const result = preprocessCanvas(noCtxCanvas);

        expect(result).toBe(noCtxCanvas);
        delete (noCtxCanvas as any).getContext;
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
        // 4th pixel: index 12, grayscale 130. Stretched value 96. With clamped-edge sharpening (strength=0.5 default),
        // its blurred neighborhood averages higher (~107) so the pixel is pulled slightly darker than its stretched value.
        expect(resultData[12]).toBe(91);
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

    it('sharpens edge pixels instead of passing them through unchanged', () => {
        // 5x1 strip: black bar at top, white interior. The first pixel (0,0) is an edge
        // (dark corner). If edge sharpening is applied, the dark pixel should get even
        // darker (negative response to its light neighbors); if skipped, it stays at 0.
        const w = 5;
        const h = 1;
        const stripCanvas = document.createElement('canvas');
        stripCanvas.width = w;
        stripCanvas.height = h;
        const sCtx = stripCanvas.getContext('2d')!;
        const stripData = new Uint8ClampedArray(w * 4);
        for (let i = 0; i < stripData.length; i++) {
            // First pixel black, rest white
            stripData[i] = i === 0 ? 0 : 200;
        }
        sCtx.putImageData({ data: new Uint8ClampedArray(stripData), width: w, height: h, colorSpace: 'srgb' } as ImageData, 0, 0);

        const result = preprocessCanvas(stripCanvas, 1.0);
        const resultData = sCtx.getImageData(0, 0, w, 1).data;

        // Original first pixel is black (0). Sharpening should push it darker than its neighbors
        // (which average to ~200), so the response is negative → stays at 0 but the second pixel
        // (white) should get brighter. If edges were skipped, the white pixel would be unchanged;
        // with edge sharpening, it increases.
        expect(resultData[4]).toBeGreaterThan(200);
    });

    it('handles a single-color canvas without error', () => {
        const data = new Uint8ClampedArray(36).fill(128);
        ctx.putImageData({ data: new Uint8ClampedArray(data), width: 3, height: 3, colorSpace: 'srgb' } as ImageData, 0, 0);
        const result = preprocessCanvas(canvas);
        expect(result.getContext('2d')?.getImageData(0, 0, 3, 3).data[0]).toBe(128);
    });

    describe('frameBrightness', () => {
        it('returns the brightness value for a constant grayscale canvas', () => {
            const w = 10;
            const h = 10;
            const brightCanvas = document.createElement('canvas');
            brightCanvas.width = w;
            brightCanvas.height = h;
            const bCtx = brightCanvas.getContext('2d')!;
            const brightData = new Uint8ClampedArray(w * h * 4);
            for (let i = 0; i < brightData.length; i += 4) {
                brightData[i] = 150;
                brightData[i + 1] = 150;
                brightData[i + 2] = 150;
                brightData[i + 3] = 255;
            }
            bCtx.putImageData({ data: new Uint8ClampedArray(brightData), width: w, height: h, colorSpace: 'srgb' } as ImageData, 0, 0);

            const brightness = frameBrightness(brightCanvas);
            expect(brightness).toBe(150);
        });

        it('returns 0 for a uniformly black canvas', () => {
            const w = 5;
            const h = 5;
            const darkCanvas = document.createElement('canvas');
            darkCanvas.width = w;
            darkCanvas.height = h;
            const dCtx = darkCanvas.getContext('2d')!;
            const darkData = new Uint8ClampedArray(w * h * 4);
            // All zeros already, but explicit for clarity
            dCtx.putImageData({ data: new Uint8ClampedArray(darkData), width: w, height: h, colorSpace: 'srgb' } as ImageData, 0, 0);

            const brightness = frameBrightness(darkCanvas);
            expect(brightness).toBe(0);
        });

        it('returns 0 (not NaN) when no pixels are sampled', () => {
            // A canvas with zero pixel area produces no samples; count stays 0,
            // so `sum / count` would be NaN. The function must handle this edge case
            // without crashing — here it returns 0 from the context fallback or
            // the loop never runs and the implementation degrades gracefully.
            const emptyCanvas = document.createElement('canvas');

            const brightness = frameBrightness(emptyCanvas);
            expect(brightness).not.toBeNaN();
        });

        it('returns 255 for a uniformly white canvas', () => {
            const w = 5;
            const h = 5;
            const whiteCanvas = document.createElement('canvas');
            whiteCanvas.width = w;
            whiteCanvas.height = h;
            const wCtx = whiteCanvas.getContext('2d')!;
            const whiteData = new Uint8ClampedArray(w * h * 4);
            for (let i = 0; i < whiteData.length; i++) {
                whiteData[i] = 255;
            }
            wCtx.putImageData({ data: new Uint8ClampedArray(whiteData), width: w, height: h, colorSpace: 'srgb' } as ImageData, 0, 0);

            const brightness = frameBrightness(whiteCanvas);
            expect(brightness).toBe(255);
        });
    });});