import { describe, it, expect, beforeEach, vi } from 'vitest';
import { $, $$, $as, getContext2D } from './dom';

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

        it('throws descriptive error for invalid CSS selector', () => {
            expect(() => $('[')).toThrow();
        });
    });

    describe('$as', () => {
        it('returns element cast to specific type', () => {
            document.body.innerHTML = '<video id="vid"></video>';
            const el = $as('#vid', HTMLVideoElement);
            expect(el).toBeInstanceOf(HTMLVideoElement);
        });

        it('returns canvas cast to HTMLCanvasElement', () => {
            document.body.innerHTML = '<canvas id="cvs"></canvas>';
            const el = $as('#cvs', HTMLCanvasElement);
            expect(el).toBeInstanceOf(HTMLCanvasElement);
        });

        it('throws for missing element', () => {
            expect(() => $as('#missing', HTMLVideoElement)).toThrow('Required DOM element not found');
        });
    });

    describe('$$', () => {
        it('returns matching elements as array', () => {
            document.body.innerHTML = '<div class="item">A</div><div class="item">B</div>';
            const els = $$('.item');
            expect(els).toHaveLength(2);
            expect(els[0].textContent).toBe('A');
            expect(els[1].textContent).toBe('B');
        });

        it('returns empty array for no matches', () => {
            document.body.innerHTML = '<div id="other">X</div>';
            const els = $$('.nonexistent');
            expect(Array.isArray(els)).toBe(true);
            expect(els).toEqual([]);
        });

        it('returns real Array, not NodeList', () => {
            document.body.innerHTML = '<span class="s">1</span><span class="s">2</span>';
            const els = $$('.s');
            expect(Array.isArray(els)).toBe(true);
            // Verify array-typed behavior: .map() must exist and work, ruling out raw NodeList.
            const texts = els.map(s => s.textContent);
            expect(texts).toEqual(['1', '2']);
        });

        it('returns elements in document order', () => {
            document.body.innerHTML = '<div class="d">third</div><div class="d">first</div><div class="d">second</div>';
            const els = $$('.d');
            expect(els).toHaveLength(3);
            expect(els[0].textContent).toBe('third');
            expect(els[1].textContent).toBe('first');
            expect(els[2].textContent).toBe('second');
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
