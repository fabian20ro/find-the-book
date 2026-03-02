interface TesseractLine {
    text: string;
    confidence: number;
}

interface TesseractResult {
    data: {
        text: string;
        confidence: number;
        lines?: TesseractLine[];
    };
}

interface TesseractWorker {
    recognize(image: HTMLCanvasElement): Promise<TesseractResult>;
    setParameters(params: Record<string, string>): Promise<void>;
    terminate(): Promise<void>;
}

declare namespace Tesseract {
    function createWorker(lang: string): Promise<TesseractWorker>;
}
