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
            expect(els).toEqual([]);
        });

        it('returns real Array, not NodeList', () => {
            document.body.innerHTML = '<span class="s">1</span><span class="s">2</span>';
            const els = $$('.s');
            expect(Array.isArray(els)).toBe(true);
            expect(Object.prototype.toString.call(els)).not.toBe('[object NodeList]');
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
