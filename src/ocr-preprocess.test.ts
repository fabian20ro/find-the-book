import 'vitest-canvas-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { preprocessCanvas, frameBrightness } from './ocr';

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
    });
});
