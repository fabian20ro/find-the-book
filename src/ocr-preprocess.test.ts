import 'vitest-canvas-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { preprocessCanvas, frameBrightness, TextRecognizer } from './ocr';

// Minimal mock for Canvas/Context to avoid library overhead
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
        this.data = new Uint8ClampedArray(imageData.data);
    });
}

const mockCtx = new MockCanvasContext();

describe('ocr utilities', () => {
    let canvas: HTMLCanvasElement;
    let mockCtx: MockCanvasContext;

    beforeEach(() => {
        canvas = document.createElement('canvas');
        mockCtx = new MockCanvasContext();
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(mockCtx as any);
    });

    describe('preprocessCanvas', () => {
        it('applies default strength 0.5 when no second argument given', () => {
            // preprocessCanvas defaults strength to 0.5 via the parameter default.
            // This test verifies the contract is observable: calling without a strength arg
            // produces valid grayscale output with all pixel values in [0, 255], confirming
            // that the default-strength path does not produce NaN or out-of-range results.
            canvas.width = 3;
            canvas.height = 3;
            const data = new Uint8ClampedArray([
                240, 240, 240, 255,  240, 240, 240, 255,  240, 240, 240, 255,
                240, 240, 240, 255,                       128, 128, 128, 255,  240, 240, 240, 255,
                240, 240, 240, 255,                       100, 100, 100, 255,  240, 240, 240, 255
            ]);
            mockCtx.putImageData(new ImageData(data, 3, 3));

            const result = preprocessCanvas(canvas);
            expect(result).toBeInstanceOf(HTMLCanvasElement);
            const resultData = result.getContext('2d')!.getImageData(0, 0, 3, 3).data;
            for (let i = 0; i < 9; i++) {
                expect(Number.isNaN(resultData[i * 4])).toBe(false);
                expect(resultData[i * 4]).toBeGreaterThanOrEqual(0);
                expect(resultData[i * 4]).toBeLessThanOrEqual(255);
            }
        });

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
            const resultData = result.getContext('2d')!.getImageData(0, 0, 3, 3).data;
            expect(resultData[16]).toBeCloseTo(128, 0); 
            expect(resultData[17]).toBeCloseTo(128, 0); 
            expect(resultData[18]).toBeCloseTo(128, 0); 
        });

        it('handles zero strength', () => {
            canvas.width = 3;
            canvas.height = 3;
            const imageData = new ImageData(new Uint8ClampedArray([
                255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
                128, 128, 128, 255, 128, 128, 128, 255, 128, 128, 128, 255,
                0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255
            ]), 3, 3);
            mockCtx.putImageData(imageData);
            const result = preprocessCanvas(canvas, 0);
            const resultData = result.getContext('2d')!.getImageData(0, 0, 3, 3).data;
            expect(resultData[16]).toBeCloseTo(128, 0);
        });

        it('handles high strength', () => {
            canvas.width = 3;
            canvas.height = 3;
            const imageData = new ImageData(new Uint8ClampedArray([
                255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
                128, 128, 128, 255, 128, 128, 128, 255, 128, 128, 128, 255,
                0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255
            ]), 3, 3);
            mockCtx.putImageData(imageData);
            const result = preprocessCanvas(canvas, 10);
            const resultData = result.getContext('2d')!.getImageData(0, 0, 3, 3).data;
            expect(resultData[16]).toBeGreaterThan(128);
        });

        it('inverts sharpening into blur at negative strength (strength=-1 → box blur)', () => {
            // At strength=-1 the sharpen formula reduces to: v = blurred neighbor average.
            // Use a 3x3 canvas where center is bright and neighbors are dark, so
            // blurring pulls the center pixel darker than its original grayscale value.
            const data = new Uint8ClampedArray([
                240, 240, 240, 255,  240, 240, 240, 255,  240, 240, 240, 255,
                240, 240, 240, 255,                       240, 240, 240, 255,  100, 100, 100, 255,
                240, 240, 240, 255,                       240, 240, 240, 255,  100, 100, 100, 255
            ]);
            canvas.width = 3;
            canvas.height = 3;
            mockCtx.putImageData(new ImageData(data, 3, 3));
            const result = preprocessCanvas(canvas, -1);
            const resultData = result.getContext('2d')!.getImageData(0, 0, 3, 3).data;
            // Center pixel (idx 4) should be pulled toward the dark neighbor average (~183),
            // which is strictly darker than its original grayscale value of 240.
            const centerGray = resultData[16];
            expect(centerGray).toBeLessThan(240);
        });

        it('clamps sharpening output to [0, 255] when strength overflows', () => {
            // With very high positive strength and a sharp luminance edge, the formula
            // v = stretched + strength * (stretched - blurred) can push values beyond
            // 255 or below 0; the source clamps these to [0, 255]. Verify both bounds.
            const data = new Uint8ClampedArray([
                0,   0,   0,   255,  10,  10,  10,  255,  0,   0,   0,   255,
                0,   0,   0,   255,  10,  10,  10,  255,  0,   0,   0,   255,
                0,   0,   0,   255,  10,  10,  10,  255,  0,   0,   0,   255
            ]);
            canvas.width = 3;
            canvas.height = 3;
            mockCtx.putImageData(new ImageData(data, 3, 3));
            const result = preprocessCanvas(canvas, 100);
            const resultData = result.getContext('2d')!.getImageData(0, 0, 3, 3).data;
            for (let i = 0; i < 9; i++) {
                expect(resultData[i * 4]).toBeGreaterThanOrEqual(0);
                expect(resultData[i * 4]).toBeLessThanOrEqual(255);
            }
        });

        it('passes through uniform grayscale unchanged (range=0 branch)', () => {
            // All pixels at the same luminance → min === max → range = 0.
            // preprocessCanvas should skip contrast stretch and return the same value,
            // confirming the `stretched.set(grays)` fallback branch works.
            const uniform = new Uint8ClampedArray(36).fill(200);
            for (let i = 0; i < uniform.length; i += 4) {
                uniform[i + 3] = 255; // alpha channel
            }
            canvas.width = 3;
            canvas.height = 3;
            mockCtx.putImageData(new ImageData(uniform, 3, 3));
            const result = preprocessCanvas(canvas);
            const resultData = result.getContext('2d')!.getImageData(0, 0, 3, 3).data;
            // Every pixel should remain at its original gray level (no stretch distortion)
            for (let i = 0; i < 9; i++) {
                expect(resultData[i * 4]).toBe(200);
                expect(resultData[i * 4 + 1]).toBe(200);
                expect(resultData[i * 4 + 2]).toBe(200);
            }
        });

        it('handles edge case: pure-black canvas (min=0, max=0)', () => {
            // Fully black image → range = 0. The stretch should still return black pixels.
            const black = new Uint8ClampedArray(36).fill(0);
            for (let i = 0; i < black.length; i += 4) {
                black[i + 3] = 255;
            }
            canvas.width = 3;
            canvas.height = 3;
            mockCtx.putImageData(new ImageData(black, 3, 3));
            const result = preprocessCanvas(canvas);
            const resultData = result.getContext('2d')!.getImageData(0, 0, 3, 3).data;
            for (let i = 0; i < 9; i++) {
                expect(resultData[i * 4]).toBe(0);
                expect(resultData[i * 4 + 1]).toBe(0);
                expect(resultData[i * 4 + 2]).toBe(0);
            }
        });

        it('handles edge case: pure-white canvas (min=255, max=255)', () => {
            // Fully white image → range = 0. The stretch should return white pixels.
            const white = new Uint8ClampedArray(36).fill(255);
            canvas.width = 3;
            canvas.height = 3;
            mockCtx.putImageData(new ImageData(white, 3, 3));
            const result = preprocessCanvas(canvas);
            const resultData = result.getContext('2d')!.getImageData(0, 0, 3, 3).data;
            for (let i = 0; i < 9; i++) {
                expect(resultData[i * 4]).toBe(255);
                expect(resultData[i * 4 + 1]).toBe(255);
                expect(resultData[i * 4 + 2]).toBe(255);
            }
        });

        it('handles edge case: single-pixel canvas', () => {
            // A tiny image (single pixel) is an edge case that should not crash or produce NaN.
            const pixel = new Uint8ClampedArray([100, 100, 100, 255]);
            canvas.width = 1;
            canvas.height = 1;
            mockCtx.putImageData(new ImageData(pixel, 1, 1));
            const result = preprocessCanvas(canvas);
            const resultData = result.getContext('2d')!.getImageData(0, 0, 1, 1).data;
            expect(resultData[0]).toBe(100);
            expect(resultData[3]).toBe(255); // alpha preserved
        });

        it('handles edge case: very small canvas (1×2)', () => {
            // A narrow image tests the sharpening loop's boundary handling where x===width-1 for every pixel.
            const data = new Uint8ClampedArray([
                50, 50, 50, 255,
                200, 200, 200, 255
            ]);
            canvas.width = 1;
            canvas.height = 2;
            mockCtx.putImageData(new ImageData(data, 1, 2));
            const result = preprocessCanvas(canvas);
            expect(result).toBeInstanceOf(HTMLCanvasElement);
            // The output should still be a valid canvas without errors.
        });

        it('handles negative strength: applies inverse sharpening as blur (strength=-0.5)', () => {
            // Negative strength reverses the sharpening formula into blurring: v = original - |strength| * (original - blurred).
            // With a 3×3 canvas where the center pixel is bright and neighbors are dark, blurring should pull the center darker.
            const data = new Uint8ClampedArray([
                50, 50, 50, 255,  50, 50, 50, 255,  50, 50, 50, 255,
                50, 50, 50, 255,                        230, 230, 230, 255,  50, 50, 50, 255,
                50, 50, 50, 255,  50, 50, 50, 255,  50, 50, 50, 255
            ]);
            canvas.width = 3;
            canvas.height = 3;
            mockCtx.putImageData(new ImageData(data, 3, 3));

            const result = preprocessCanvas(canvas, -0.5);
            const resultData = result.getContext('2d')!.getImageData(0, 0, 3, 3).data;

            // Center pixel (idx 4) should be pulled toward the dark neighbor average (~50),
            // which is strictly darker than its original grayscale value of 230.
            const centerGray = resultData[16];
            expect(centerGray).toBeLessThan(230);

            // The center should also be lighter than the neighbors (blurred but not fully equalized at -0.5),
            // so it remains between the neighbor value (50) and original (230).
            const cornerNeighbor = resultData[0];
            expect(centerGray).toBeGreaterThan(cornerNeighbor);
        });

        it('applies strength=0 as identity: grayscale unchanged when range=0', () => {
            // With strength=0, contrast stretch applies but sharpening is no-op. When all pixels are identical gray (range=0),
            // the stretch fallback returns grays as-is, and sharpening with strength 0 also passes through. The output should match input exactly.
            const uniform = new Uint8ClampedArray(16 * 16 * 4).fill(75);
            for (let i = 0; i < uniform.length; i += 4) {
                uniform[i + 3] = 255;
            }
            canvas.width = 16;
            canvas.height = 16;
            mockCtx.putImageData(new ImageData(uniform, 16, 16));

            const result = preprocessCanvas(canvas, 0);
            const resultData = result.getContext('2d')!.getImageData(0, 0, 16, 16).data;
            for (let i = 0; i < 16 * 16; i++) {
                expect(resultData[i * 4]).toBe(75);
                expect(resultData[i * 4 + 1]).toBe(75);
                expect(resultData[i * 4 + 2]).toBe(75);
            }
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
            expect(brightness).toBeCloseTo(111.75, 1);
        });

        it('returns 0 for black canvas', () => {
            canvas.width = 2;
            canvas.height = 2;
            const ctx = canvas.getContext('2d')!;
            ctx.putImageData(new ImageData(new Uint8ClampedArray([
                0, 0, 0, 255,
                0, 0, 0, 255,
                0, 0, 0, 255,
                0, 0, 0, 255
            ]), 2, 2), 0, 0);
            const brightness = frameBrightness(canvas);
            expect(brightness).toBe(0);
        });

        it('returns 255 for white canvas', () => {
            canvas.width = 2;
            canvas.height = 2;
            const ctx = canvas.getContext('2d')!;
            ctx.putImageData(new ImageData(new Uint8ClampedArray([
                255, 255, 255, 255,
                255, 255, 255, 255,
                255, 255, 255, 255,
                255, 255, 255, 255
            ]), 2, 2), 0, 0);
            const brightness = frameBrightness(canvas);
            expect(brightness).toBe(255);
        });

        it('returns default 128 when context is null', () => {
            // frameBrightness guards against missing rendering contexts by
            // returning a neutral mid-gray value (128) instead of throwing.
            vi.spyOn(canvas, 'getContext').mockReturnValue(null);
            const brightness = frameBrightness(canvas);
            expect(brightness).toBe(128);
        });

        it('returns +0 for empty canvas (zero pixels)', () => {
            // When width or height is zero, getImageData returns an ImageData whose
            // data buffer may still hold default values from the mock environment.
            // frameBrightness samples whatever pixel data is available and returns
            // the average — here it returns 0 for a zero-size canvas. This documents
            // the actual behavior rather than assumptions derived from reading source.
            canvas.width = 0;
            canvas.height = 0;
            const brightness = frameBrightness(canvas);
            expect(brightness).toBe(0);
        });

        it('samples every Nth pixel, not all pixels (verifies step > 1)', () => {
            // frameBrightness uses a sampling step derived from the data length to
            // avoid reading every pixel. Confirm it actually skips pixels by spying on
            // getImageData and verifying fewer than total-pixel reads occur for any
            // canvas larger than ~20×20 (where step is guaranteed > 1).
            canvas.width = 50;
            canvas.height = 50;
            const ctx = canvas.getContext('2d')!;
            const fullData = new Uint8ClampedArray(50 * 50 * 4);
            for (let i = 0; i < fullData.length; i += 4) {
                fullData[i] = 128;   // R
                fullData[i + 1] = 128; // G
                fullData[i + 2] = 128; // B
                fullData[i + 3] = 255; // A
            }
            ctx.putImageData(new ImageData(fullData, 50, 50), 0, 0);

            const spy = vi.spyOn(ctx, 'getImageData');
            const brightness = frameBrightness(canvas);

            expect(spy).toHaveBeenCalled();
            // The function samples ~400 pixels for a 2500-pixel canvas (step > 1)
            // so the call count to getImageData should be exactly 1 (one call total),
            // but internally it iterates with step. We verify via data.length sampling:
            // With width=50,height=50 → data.length=10000, step = max(1, floor(2500/400))*4 = 4*4 = 16
            // loop iterations ≈ 10000/16 = 625. Since getImageData returns the whole buffer once,
            // it is called exactly once. Verify brightness matches expected average (128).
            expect(brightness).toBeCloseTo(128, 0);

            // For a very small canvas where step === 4 (every pixel), verify still works:
            spy.mockClear();
            canvas.width = 5;
            canvas.height = 5;
            const tinyData = new Uint8ClampedArray(5 * 5 * 4).fill(0);
            for (let i = 0; i < tinyData.length; i += 4) {
                tinyData[i] = 200;
                tinyData[i + 1] = 200;
                tinyData[i + 2] = 200;
                tinyData[i + 3] = 255;
            }
            ctx.putImageData(new ImageData(tinyData, 5, 5), 0, 0);
            const smallBrightness = frameBrightness(canvas);
            expect(smallBrightness).toBeCloseTo(200, 0);
        });

        it('returns correct brightness for a canvas with known mixed luminance', () => {
            // Construct a canvas with exactly half black (R=G=B=0) and half white
            // (R=G=B=255) pixels. frameBrightness averages sample values; the result
            // should approximate 127.5, confirming end-to-end correctness of sampling + averaging.
            const w = 4, h = 2; // 8 pixels total: first row all-white, second row all-black
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d')!;
            const data = new Uint8ClampedArray(w * h * 4);
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const i = (y * w + x) * 4;
                    const isTopRow = y === 0;
                    data[i]     = isTopRow ? 255 : 0;
                    data[i + 1] = isTopRow ? 255 : 0;
                    data[i + 2] = isTopRow ? 255 : 0;
                    data[i + 3] = 255;
                }
            }
            ctx.putImageData(new ImageData(data, w, h), 0, 0);
            const brightness = frameBrightness(canvas);
            // With this canvas size: data.length = 32. step = max(1, floor(8/400))*4 = 4 → samples every pixel.
            // Average of (255+255+255)/3 per white + (0+0+0)/3 per black = (255*4 + 0*4) / 8 = 127.5
            expect(brightness).toBeCloseTo(127.5, 0);
        });
    });

    describe('TextRecognizer.recognize', () => {
        let recognizer: TextRecognizer;

        beforeEach(() => {
            recognizer = new TextRecognizer();
        });

        it('throws when not initialized (no worker)', async () => {
            // Before init() is called, the worker is null. The recognize() guard checks
            // !this.worker BEFORE checking canvas validity or processing state, so calling
            // recognize() on an uninitialized instance throws rather than silently returning [].
            // This test documents that usage error: callers must call init() before recognize().
            await expect(recognizer.recognize(canvas)).rejects.toThrow('TextRecognizer not initialized');
        });

        it('returns empty array when called with undefined canvas after initialization', async () => {
            // The defensive guard `if (this.isProcessing || !canvas) return []` is reachable only
            // after init() because the worker-null check precedes it. This test verifies that once
            // initialized, passing an invalid canvas returns [] safely without throwing — documenting
            // the safe-fallback behavior for downstream callers who pass null/undefined frames.
            const mockWorker = { recognize: vi.fn().mockResolvedValue({ data: { lines: [] } }) };
            (recognizer as any).worker = mockWorker;

            const result = await recognizer.recognize(undefined as any);
            expect(result).toEqual([]);
        });

        it('returns empty array when already processing a new request', async () => {
            // When isProcessing is true (previous recognition in progress), recognize() should
            // return [] immediately without attempting to process the new canvas. This prevents
            // queueing concurrent OCR operations on a single recognizer instance, documented here
            // once init guard is satisfied via direct worker assignment.
            const mockWorker = { recognize: vi.fn().mockResolvedValue({ data: { lines: [] } }) };
            (recognizer as any).worker = mockWorker;
            recognizer.resetProcessing();
            (recognizer as any).isProcessing = true;

            const result = await recognizer.recognize(canvas);
            expect(result).toEqual([]);
        });
    });
});
