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
    });
});
