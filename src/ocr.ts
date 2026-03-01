/**
 * Convert to grayscale and apply linear contrast stretch (min-max normalization).
 * Falls back to the original canvas if 2D context is unavailable.
 */
function preprocessCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    const { width, height } = canvas;
    const imageData = ctx.getImageData(0, 0, width, height);
    const src = imageData.data;
    const pixelCount = width * height;

    // Convert to grayscale and find min/max for contrast stretch
    const grays = new Uint8Array(pixelCount);
    let min = 255, max = 0;
    for (let i = 0; i < pixelCount; i++) {
        const gray = Math.round(0.299 * src[i * 4] + 0.587 * src[i * 4 + 1] + 0.114 * src[i * 4 + 2]);
        grays[i] = gray;
        if (gray < min) min = gray;
        if (gray > max) max = gray;
    }

    const range = max - min || 1; // avoid division by zero for flat images
    const out = document.createElement('canvas');
    out.width = width;
    out.height = height;
    const outCtx = out.getContext('2d')!;
    const outData = outCtx.createImageData(width, height);
    for (let i = 0; i < pixelCount; i++) {
        const v = Math.round(((grays[i] - min) / range) * 255);
        outData.data[i * 4]     = v;
        outData.data[i * 4 + 1] = v;
        outData.data[i * 4 + 2] = v;
        outData.data[i * 4 + 3] = 255;
    }
    outCtx.putImageData(outData, 0, 0);
    return out;
}

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
            const processedCanvas = preprocessCanvas(canvas);
            const result = await this.worker.recognize(processedCanvas);
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
