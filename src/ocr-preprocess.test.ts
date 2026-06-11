import { describe, it, expect, vi, beforeEach } from 'vitest';
import { preprocessCanvas, frameBrightness } from './ocr';

describe('preprocessCanvas', () => {
    let canvas: HTMLCanvasElement;
    let mockCtx: any;

    beforeEach(() => {
        canvas = document.createElement('canvas');
        mockCtx = {
            getImageData: vi.fn().mockReturnValue({
                data: new Uint8ClampedArray(36),
                width: 3,
                height: 3
            }),
            createImageData: vi.fn().mockImplementation((w, h) => ({
                data: new Uint8ClampedArray(w * h * 4),
                width: w,
                height: h
            })),
            putImageData: vi.fn(),
        };
        vi.spyOn(canvas, 'getContext').mockReturnValue(mockCtx);
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
        
        mockCtx.getImageData.mockReturnValue(imageData);
        
        const result = preprocessCanvas(canvas, 0.5);
        
        expect(result).toBeInstanceOf(HTMLCanvasElement);
        expect(mockCtx.putImageData).toHaveBeenCalled();
        
        const outData = mockCtx.putImageData.mock.calls[0][0].data;
        
        // Center pixel (1,1) is index 13 in a 3x3 array (4*3 + 1 = 13)
        // Wait, index 13 is row 4, col 1. Row index = 1, Col index = 1.
        // Index = row * width + col = 1 * 3 + 1 = 4.
        // But data is 1D array of 36 elements (3*3*4).
        // Pixel (1,1) in 1D index (row*width + col) is 4.
        // But in the RGBA data array it's 4*3 + 1 = 13.
        // Let's check calculation:
        // Neighbors sum (8 pixels):
        // (0,0), (1,0), (2,0) -> 0, 3, 6
        // (0,1), (2,1) -> 1, 5
        // (0,2), (1,2), (2,2) -> 8, 11, 14 (Wait, 3x3)
        // 3x3 indices:
        // 0 1 2
        // 3 4 5
        // 6 7 8
        // indices for neighbors: 0, 1, 2, 3, 5, 6, 7, 8.
        // Neighbors values:
        // 0:255, 1:255, 2:255, 3:128, 5:128, 6:0, 7:0, 8:0.
        // Sum = 3*255 + 2*128 + 3*0 = 765 + 256 = 1021.
        // blurred = 1021/9 = 113.44
        // v = 128 + 0.5 * (128 - 113.44) = 128 + 7.28 = 135.28 -> 135.
        expect(outData[13]).toBeCloseTo(135, 0);
    });
});

describe('frameBrightness', () => {
    it('calculates average brightness correctly', () => {
        const canvas = document.createElement('canvas');
        canvas.width = 2;
        canvas.height = 2;
        const ctx = canvas.getContext('2d')!;
        ctx.putImageData(new ImageData(new Uint8ClampedArray([
            255, 255, 255, 255,
            0, 0, 0, 255,
            128, 128, 128, 255,
            64, 64, 64, 255
        ]), 2, 2), 0, 0);

        // Expected brightness: (255 + 0 + 128 + 64) / 4 = 109.25
        const brightness = frameBrightness(canvas);
        expect(brightness).toBeCloseTo(109.25, 1);
    });
});