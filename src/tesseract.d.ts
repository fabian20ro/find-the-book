interface TesseractLine {
    text: string;
}

interface TesseractResult {
    data: {
        lines?: TesseractLine[];
    };
}

interface TesseractWorker {
    recognize(image: HTMLCanvasElement): Promise<TesseractResult>;
    terminate(): Promise<void>;
}

declare namespace Tesseract {
    function createWorker(lang: string): Promise<TesseractWorker>;
}
