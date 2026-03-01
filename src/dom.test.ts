import { describe, it, expect, beforeEach, vi } from 'vitest';
import { $, $as, getContext2D } from './dom';

describe('dom helpers', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    describe('$', () => {
        it('returns matching element', () => {
            document.body.innerHTML = '<div id="test">Hello</div>';
            const el = $('#test');
            expect(el).toBeInstanceOf(HTMLElement);
            expect(el.textContent).toBe('Hello');
        });

        it('throws for missing element', () => {
            expect(() => $('#nonexistent')).toThrow('Required DOM element not found: "#nonexistent"');
        });
    });

    describe('$as', () => {
        it('returns element cast to specific type', () => {
            document.body.innerHTML = '<video id="vid"></video>';
            const el = $as('#vid', HTMLVideoElement);
            expect(el).toBeInstanceOf(HTMLVideoElement);
        });

        it('throws for missing element', () => {
            expect(() => $as('#missing', HTMLVideoElement)).toThrow('Required DOM element not found');
        });
    });

    describe('getContext2D', () => {
        it('returns 2D context from canvas', () => {
            const canvas = document.createElement('canvas');
            const mockCtx = { canvas } as unknown as CanvasRenderingContext2D;
            vi.spyOn(canvas, 'getContext').mockReturnValue(mockCtx as any);

            const ctx = getContext2D(canvas);
            expect(ctx).toBe(mockCtx);
        });

        it('throws when getContext returns null', () => {
            const canvas = document.createElement('canvas');
            vi.spyOn(canvas, 'getContext').mockReturnValue(null);

            expect(() => getContext2D(canvas)).toThrow('Could not get 2D rendering context');
        });
    });
});
