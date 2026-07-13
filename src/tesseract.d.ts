interface TesseractLine {
    text: string;
    confidence: number;
}

export interface TesseractResult {
    data: {
        text: string;
        confidence: number;
        lines?: TesseractLine[];
    };
}

/** Methods that TextRecognizer.invoke on the worker at runtime. */
interface TesseractWorker {
    recognize(image: ImageBitmap | HTMLCanvasElement | HTMLImageElement): Promise<TesseractResult>;
    setParameters(params: Record<string, string>): Promise<void>;
    saveLanguageModel?(): Promise<void>;
    terminate(): Promise<void>;
}

export interface CreateWorkerOptions {
    lang?: string;
    workerPath?: string;
    corePath?: string;
    logger?: (message: unknown) => void;
}

declare global {
    namespace Tesseract {
        function createWorker(
            langOrOptions: string | CreateWorkerOptions,
            onProgress?: (progress: number, status: string) => void,
        ): Promise<TesseractWorker>;

        function downloadLanguage(lang: string): Promise<void>;

        function getCacheDirectory(): Promise<string>;

        function clearDatabase(): Promise<void>;
    }

    // Tesseract.js exposes itself as a global variable loaded from the CDN.
    const Tesseract: {
        createWorker(
            langOrOptions: string | CreateWorkerOptions,
            onProgress?: (progress: number, status: string) => void,
        ): Promise<Tesseract.TesseractWorker>;

        downloadLanguage(lang: string): Promise<void>;

        getCacheDirectory(): Promise<string>;

        clearDatabase(): Promise<void>;
    };
}

export {};
