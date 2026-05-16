export interface OcrLine {
    text: string;
    confidence: number;
}

const MIN_LINE_LENGTH = 3;
const MIN_LINE_CONFIDENCE = 40;

const COMMON_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,;:\'-&()!?""/';
const LANG_WHITELISTS: Record<string, string> = {
    eng: COMMON_CHARS,
    ron: COMMON_CHARS + 'ăâîșțĂÂÎȘȚ',
    fra: COMMON_CHARS + 'àâäèéêëîïôùûüœæçñÀÂÈÉÊËÎÏÔÙÛÜŒÆÇÑ',
    deu: COMMON_CHARS + 'äöüßÄÖÜ',
    ita: COMMON_CHARS + 'àèéìòùÀÈÉÌÒÙ',
    spa: COMMON_CHARS + 'áéíóúüñÁÉÍÓÚÜÑ¿¡',
    por: COMMON_CHARS + 'àáâãçéêíóôõúÀÁÂÃÇÉÊÍÓÔÕÚ',
    nld: COMMON_CHARS + 'àáâäèéêëïíîòóôöùúûü',
    pol: COMMON_CHARS + 'ąćęłńóśźżĄĆĘŁŃÓŚŹŻ',
    hun: COMMON_CHARS + 'áéíóöőúüűÁÉÍÓÖŐÚÜŰ',
    ces: COMMON_CHARS + 'áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ',
    tur: COMMON_CHARS + 'çğıöşüÇĞİÖŞÜ',
    swe: COMMON_CHARS + 'åäöÅÄÖ',
};

/**
 * Convert to grayscale, apply linear contrast stretch, and sharpen.
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

    // ⚡ Bolt Optimization: Use integer arithmetic and bitwise shifts instead of floating point math
    // 0.299 * 256 ≈ 77, 0.587 * 256 ≈ 150, 0.114 * 256 ≈ 29
    for (let i = 0; i < pixelCount; i++) {
        const i4 = i * 4;
        const gray = (77 * src[i4] + 150 * src[i4 + 1] + 29 * src[i4 + 2]) >> 8;
        grays[i] = gray;
        if (gray < min) min = gray;
        if (gray > max) max = gray;
    }

    // Contrast stretch (min-max normalization)
    const range = max - min || 1;
    const stretched = new Uint8Array(pixelCount);

    // ⚡ Bolt Optimization: Precalculate scaling factor and use bitwise OR to truncate
    const scale = 255 / range;
    for (let i = 0; i < pixelCount; i++) {
        stretched[i] = ((grays[i] - min) * scale) | 0;
    }

    // Lightweight unsharp mask: sharpen = original + strength * (original - blurred)
    // Uses a simple 3x3 box blur approximation for speed
    const STRENGTH = 0.5;
    const sharpened = new Uint8Array(pixelCount);
    for (let y = 0; y < height; y++) {
        // ⚡ Bolt Optimization: Precalculate row offsets
        const yw = y * width;
        const ym1w = (y - 1) * width;
        const yp1w = (y + 1) * width;

        for (let x = 0; x < width; x++) {
            const idx = yw + x;
            if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
                sharpened[idx] = stretched[idx];
                continue;
            }
            // 3x3 box blur (average of neighbors)
            const blurred = (
                stretched[ym1w + (x - 1)] + stretched[ym1w + x] + stretched[ym1w + (x + 1)] +
                stretched[yw + (x - 1)]   + stretched[yw + x]   + stretched[yw + (x + 1)] +
                stretched[yp1w + (x - 1)] + stretched[yp1w + x] + stretched[yp1w + (x + 1)]
            ) / 9;
            const v = stretched[idx] + STRENGTH * (stretched[idx] - blurred);
            // ⚡ Bolt Optimization: Fast inline clamp
            sharpened[idx] = v < 0 ? 0 : (v > 255 ? 255 : (v | 0));
        }
    }

    const out = document.createElement('canvas');
    out.width = width;
    out.height = height;
    const outCtx = out.getContext('2d')!;
    const outData = outCtx.createImageData(width, height);
    for (let i = 0; i < pixelCount; i++) {
        const i4 = i * 4;
        const val = sharpened[i];
        outData.data[i4]     = val;
        outData.data[i4 + 1] = val;
        outData.data[i4 + 2] = val;
        outData.data[i4 + 3] = 255;
    }
    outCtx.putImageData(outData, 0, 0);
    return out;
}

/**
 * Check if a canvas frame is too dark for useful OCR.
 * Samples pixels and returns average brightness (0-255).
 */
export function frameBrightness(canvas: HTMLCanvasElement): number {
    const ctx = canvas.getContext('2d');
    if (!ctx) return 128;
    const { width, height } = canvas;
    const data = ctx.getImageData(0, 0, width, height).data;
    // Sample every 100th pixel for speed
    const step = Math.max(1, Math.floor(data.length / 4 / 400)) * 4;
    let sum = 0;
    let count = 0;
    for (let i = 0; i < data.length; i += step) {
        sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
        count++;
    }
    return count > 0 ? sum / count : 128;
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
        await this.applyWhitelist(lang);
    }

    async setLanguage(lang: string): Promise<void> {
        if (lang === this.currentLang && this.worker) return;

        const prevLang = this.currentLang;
        const prevWorker = this.worker;
        let nextWorker: TesseractWorker | null = null;

        this.isProcessing = false;
        this.currentLang = lang;

        try {
            nextWorker = await Tesseract.createWorker(lang);
            this.worker = nextWorker;
            await this.applyWhitelist(lang);

            if (prevWorker) {
                await prevWorker.terminate();
            }
        } catch (e) {
            if (nextWorker) {
                try {
                    await nextWorker.terminate();
                } catch {
                    // Best effort cleanup only.
                }
            }

            this.currentLang = prevLang;
            this.worker = prevWorker;
            throw e;
        }
    }

    getLanguage(): string {
        return this.currentLang;
    }

    async recognize(canvas: HTMLCanvasElement): Promise<OcrLine[]> {
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
                .map((line) => ({ text: line.text.trim(), confidence: line.confidence ?? 0 }))
                .filter((line) => line.text.length >= MIN_LINE_LENGTH && line.confidence >= MIN_LINE_CONFIDENCE);
        } catch (e) {
            const env = typeof process !== 'undefined' && process.env;
            if (env && (env.NODE_ENV === 'test' || env.DEBUG_OCR === 'true')) {
                console.error('OCR error:', e);
            }
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

    private async applyWhitelist(lang: string): Promise<void> {
        if (!this.worker) return;
        const whitelist = LANG_WHITELISTS[lang];
        if (whitelist) {
            await this.worker.setParameters({ tessedit_char_whitelist: whitelist });
        } else {
            console.warn(`No character whitelist found for language: ${lang}. Skipping.`);
        }
    }
}
