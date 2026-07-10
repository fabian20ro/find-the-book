import 'vitest-canvas-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { preprocessCanvas } from './ocr';

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

describe('preprocessCanvas', () => {
    let canvas: HTMLCanvasElement;

    beforeEach(() => {
        canvas = document.createElement('canvas');
        canvas.width = 3;
        canvas.height = 3;
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(mockCtx as any);
    });

    it('should return a new canvas instance', () => {
        const result = preprocessCanvas(canvas);
        expect(result).not.toBe(canvas);
        expect(result.width).toBe(3);
        expect(result.height).toBe(3);
    });

    it('should apply transformations', () => {
        // Set some pattern
        mockCtx.data[0] = 100; // Red channel
        mockCtx.data[1] = 100; // Green channel
        mockCtx.data[2] = 100; // Blue channel
        mockCtx.data[3] = 255; // Alpha

        const result = preprocessCanvas(canvas, 0.5);
        
        // After processing, even with 100/100/100, grayscale should still be around 100
        // but we check if the values are modified.
        expect(result.getContext('2d')?.getImageData(0, 0, 3, 3).data[0]).not.toBe(100);
    });

    it('should handle an empty (black) canvas', () => {
        // Fill with black
        for (let i = 0; i < mockCtx.data.length; i += 4) {
            mockCtx.data[i] = 0;
            mockCtx.data[i + 1] = 0;
            mockCtx.data[i + 2] = 0;
            mockCtx.data[i + 3] = 255;
        }
        
        const result = preprocessCanvas(canvas, 0.5);
        const data = result.getContext('2d')?.getImageData(0, 0, 3, 3).data;
        expect(data?.[0]).toBe(0);
    });

    it('should preserve uniform grayscale with strength=0 (zero-range branch)', () => {
        // Fill with uniform medium gray — exercises the range===0 branch in contrast stretch.
        for (let i = 0; i < mockCtx.data.length; i += 4) {
            mockCtx.data[i]     = 128;
            mockCtx.data[i + 1] = 128;
            mockCtx.data[i + 2] = 128;
            mockCtx.data[i + 3] = 255;
        }

        const result = preprocessCanvas(canvas, 0);
        const data = result.getContext('2d')?.getImageData(0, 0, 3, 3).data;

        // With strength=0 the sharpening term cancels (v == stretched[idx]).
        // With range===0 the stretch copies grays unchanged.
        expect(data?.[0]).toBe(128); // R preserved
        expect(data?.[1]).toBe(128); // G preserved
        expect(data?.[2]).toBe(128); // B preserved
    });

    it('should preserve relative luminance ordering for non-uniform grayscale input', () => {
        // Set a 3x3 grid with increasing brightness left-to-right, top-to-bottom.
        // Grayscale conversion is monotone, contrast stretch is monotone (range>0),
        // and sharpening only amplifies local differences — so relative order must be preserved.
        const expected: number[] = [10, 20, 30, 40, 50, 60, 70, 80, 90];
        for (let y = 0; y < 3; y++) {
            for (let x = 0; x < 3; x++) {
                const idx = (y * 3 + x) * 4;
                mockCtx.data[idx]     = expected[y * 3 + x];
                mockCtx.data[idx + 1] = expected[y * 3 + x];
                mockCtx.data[idx + 2] = expected[y * 3 + x];
                mockCtx.data[idx + 3] = 255;
            }
        }

        const result = preprocessCanvas(canvas);
        const data = result.getContext('2d')?.getImageData(0, 0, 3, 3).data!;
        const actual: number[] = [];
        for (let i = 0; i < expected.length; i++) {
            actual.push(data[i * 4]); // R channel == grayscale output
        }

        // Relative order must be preserved — sharpening can change magnitudes but not swap order.
        const sortedActual = [...actual].sort((a, b) => a - b);
        expect(actual).toEqual(sortedActual);
    });
});
