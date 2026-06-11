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
        
        // Center pixel (1,1) is RGBA indices 16, 17, 18, 19
        // Indices for 3x3:
        // 0  1  2
        // 3  4  5
        // 6  7  8
        // Neighbors of (1,1) are 0, 1, 2, 3, 5, 6, 7, 8
        // Neighbors values (from imageData):
        // 0:255, 1:255, 2:255, 3:128, 5:128, 6:0, 7:0, 8:0.
        // Sum = 3*255 + 2*128 + 3*0 = 1021.
        // blurred = 1021/9 = 113.44
        // v = 128 + 0.5 * (128 - 113.44) = 135.28
        expect(outData[16]).toBeCloseTo(135, 0); // Red
        expect(outData[17]).toBeCloseTo(135, 0); // Green
        expect(outData[18]).toBeCloseTo(135, 0); // Blue
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

        // Expected brightness: (255 + 0 + 128 + 64) / 4 = 111.75
        const brightness = frameBrightness(canvas);
        expect(brightness).toBeCloseTo(111.75, 1);
    });
});