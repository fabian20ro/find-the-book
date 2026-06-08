import { describe, it, expect, vi } from 'vitest';
import { preprocessCanvas, frameBrightness } from './ocr';

describe('preprocessCanvas', () => {
    it('returns the same canvas if context is null', () => {
        const canvas = document.createElement('canvas');
        vi.spyOn(canvas, 'getContext').mockReturnValue(null);
        const result = preprocessCanvas(canvas);
        expect(result).toBe(canvas);
    });

    it('performs grayscale, contrast stretch and sharpening correctly', () => {
        const canvas = document.createElement('canvas');
        canvas.width = 3;
        canvas.height = 3;
        
        // Input pixels: top row all white, middle row gray, bottom row black
        // W W W
        // G G G
        // B B B
        const imageData = {
            data: new Uint8ClampedArray([
                255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
                128, 128, 128, 255, 128, 128, 128, 255, 128, 128, 128, 255,
                0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255
            ]),
            width: 3,
            height: 3
        };
        
        const mockCtx = {
            getImageData: vi.fn().mockReturnValue(imageData),
            createImageData: vi.fn().mockImplementation((w, h) => ({
                data: new Uint8ClampedArray(w * h * 4),
                width: w,
                height: h
            })),
            putImageData: vi.fn(),
        };

        vi.spyOn(canvas, 'getContext').mockReturnValue(mockCtx as any);

        const result = preprocessCanvas(canvas, 0.5);
        
        expect(result).toBeInstanceOf(HTMLCanvasElement);
        expect(mockCtx.putImageData).toHaveBeenCalled();
        
        const outData = mockCtx.putImageData.mock.calls[0][0].data;
        
        // Center pixel (1,1) is Gray (128).
        // neighbors are White (255), Gray (128), Black (0).
        // blurred = (255*4 + 128*4 + 0*4)/9 = (1020 + 512 + 0)/9 = 1532/9 = 170.22
        // sharpened = 128 + 0.5 * (128 - 170.22) = 128 + 0.5 * (-42.22) = 128 - 21.11 = 106.89 -> 106
        expect(outData[(4 + 1) * 4]).toBeCloseTo(106, 0);
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

        // Expected brightness: (255 + 0 + 128 + 64) / 4 = 447 / 4 = 111.75
        // But it samples every 100th pixel (step = 1).
        // Wait, step = max(1, floor(len/4/400)) = max(1, floor(16/4/400)) = 1.
        // So it samples every pixel.
        const brightness = frameBrightness(canvas);
        expect(brightness).toBeCloseTo(111.75, 1);
    });

    it('returns 128 when context is null', () => {
        const canvas = document.createElement('canvas');
        vi.spyOn(canvas, 'getContext').mockReturnValue(null);
        expect(frameBrightness(canvas)).toBe(128);
    });
});
