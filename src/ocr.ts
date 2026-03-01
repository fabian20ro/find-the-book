export class TextRecognizer {
    private worker: TesseractWorker | null = null;
    private isProcessing = false;
    private currentLang = 'ron';

    async init(lang: string = 'ron'): Promise<void> {
        if (typeof Tesseract === 'undefined') {
            throw new Error(
                'Tesseract.js failed to load from CDN. Check your internet connection and try refreshing.',
            );
        }
        this.currentLang = lang;
        this.worker = await Tesseract.createWorker(lang);
    }

    async setLanguage(lang: string): Promise<void> {
        if (lang === this.currentLang && this.worker) return;
        if (this.worker) {
            await this.worker.terminate();
            this.worker = null;
        }
        this.isProcessing = false;
        this.currentLang = lang;
        this.worker = await Tesseract.createWorker(lang);
    }

    getLanguage(): string {
        return this.currentLang;
    }

    async recognize(canvas: HTMLCanvasElement): Promise<string[]> {
        if (!this.worker) {
            throw new Error('TextRecognizer not initialized. Call init() first.');
        }
        if (this.isProcessing || !canvas) return [];
        this.isProcessing = true;

        try {
            const processed = preprocessForOcr(canvas);
            const result = await this.worker.recognize(processed);
            const lines = result.data.lines || [];

            return lines
                .map((line) => line.text.trim())
                .filter((text) => text.length >= 3);
        } catch (e) {
            console.error('OCR error:', e);
            return [];
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Reset processing flag. Used when OCR times out externally
     * so the recognizer can accept new work.
     */
    resetProcessing(): void {
        this.isProcessing = false;
    }

    async destroy(): Promise<void> {
        if (this.worker) {
            await this.worker.terminate();
            this.worker = null;
        }
    }
}

/**
 * Preprocess a canvas image for better OCR results.
 * Converts to grayscale and applies contrast stretching.
 * Falls back to the original canvas if 2D context is unavailable.
 */
export function preprocessForOcr(canvas: HTMLCanvasElement): HTMLCanvasElement {
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    const { width, height } = canvas;
    if (width === 0 || height === 0) return canvas;

    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    // Pass 1: convert to grayscale and find min/max for contrast stretch
    let min = 255;
    let max = 0;
    for (let i = 0; i < data.length; i += 4) {
        const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
        data[i] = gray;
        data[i + 1] = gray;
        data[i + 2] = gray;
        if (gray < min) min = gray;
        if (gray > max) max = gray;
    }

    // Pass 2: contrast stretch (remap min..max to 0..255)
    const range = max - min;
    if (range > 0 && range < 255) {
        const scale = 255 / range;
        for (let i = 0; i < data.length; i += 4) {
            const stretched = Math.round((data[i] - min) * scale);
            data[i] = stretched;
            data[i + 1] = stretched;
            data[i + 2] = stretched;
        }
    }

    // Write to a new canvas to avoid mutating the capture canvas
    const out = document.createElement('canvas');
    out.width = width;
    out.height = height;
    const outCtx = out.getContext('2d');
    if (!outCtx) return canvas;
    outCtx.putImageData(imageData, 0, 0);
    return out;
}
