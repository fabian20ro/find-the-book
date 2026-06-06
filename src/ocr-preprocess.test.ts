import { describe, it, expect, vi } from 'vitest';
import { preprocessCanvas } from './ocr';

describe('preprocessCanvas', () => {
    it('returns the same canvas if context is null', () => {
        const canvas = document.createElement('canvas');
        vi.spyOn(canvas, 'getContext').mockReturnValue(null);
        const result = preprocessCanvas(canvas);
        expect(result).toBe(canvas);
    });

    it('performs grayscale and contrast stretch', async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 2;
        canvas.height = 2;
        
        const mockImageData = {
            data: new Uint8ClampedArray([
                255, 255, 255, 255,
                0, 0, 0, 255,
                128, 128, 128, 255,
                64, 64, 64, 255
            ]),
            width: 2,
            height: 2
        };

        const mockCtx = {
            getImageData: vi.fn().mockReturnValue(mockImageData),
            createImageData: vi.fn().mockImplementation((w, h) => ({
                data: new Uint8ClampedArray(w * h * 4),
                width: w,
                height: h
            })),
            putImageData: vi.fn(),
        };

        // Mocking getContext for the input canvas
        vi.spyOn(canvas, 'getContext').mockReturnValue(mockCtx as any);

        // Mocking document.createElement to return a canvas with our mock context
        const mockCanvas = document.createElement('canvas');
        vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
            if (tagName === 'canvas') {
                const c = mockCanvas;
                vi.spyOn(c, 'getContext').mockReturnValue(mockCtx as any);
                return c;
            }
            return document.createElement(tagName);
        });

        const result = preprocessCanvas(canvas);
        
        expect(result).toBeInstanceOf(HTMLCanvasElement);
        expect(mockCtx.putImageData).toHaveBeenCalled();
    });
});
