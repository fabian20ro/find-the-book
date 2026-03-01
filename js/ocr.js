export class TextRecognizer {
    constructor() {
        this.worker = null;
        this.isProcessing = false;
    }

    async init() {
        this.worker = await Tesseract.createWorker('eng');
    }

    async recognize(canvas) {
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

    async destroy() {
        if (this.worker) {
            await this.worker.terminate();
            this.worker = null;
        }
    }
}
