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
            const result = await this.worker.recognize(canvas);
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
