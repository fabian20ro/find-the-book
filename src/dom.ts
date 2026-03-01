/**
 * Safe DOM query helper. Throws a descriptive error if the element is not found.
 */
export function $(selector: string): HTMLElement {
    const el = document.querySelector(selector);
    if (!el) {
        throw new Error(`Required DOM element not found: "${selector}"`);
    }
    return el as HTMLElement;
}

/**
 * Typed DOM query helper for specific element types (video, canvas, etc.).
 */
export function $as<T extends HTMLElement>(
    selector: string,
    _ctor: new (...args: any[]) => T,
): T {
    const el = $(selector);
    return el as T;
}

/**
 * Safe getContext('2d') that throws instead of returning null.
 */
export function getContext2D(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('Could not get 2D rendering context from canvas');
    }
    return ctx;
}
