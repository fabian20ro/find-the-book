import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startScanning, stopScanning, scanOnce, resumeAutoScan, pauseAutoScan, searchTextBlocks } from './scanner';
import type { OcrLine } from './ocr';
import * as state from './state';
import * as ocrModule from './ocr';

// Mock frameBrightness to always return bright enough
vi.mock('./ocr', async () => {
    const actual = await vi.importActual<typeof ocrModule>('./ocr');
    return {
        ...actual,
        frameBrightness: vi.fn().mockReturnValue(128),
    };
});

// Mock state module
vi.mock('./state', async () => {
    const actual = await vi.importActual<typeof state>('./state');
    return {
        ...actual,
        toast: vi.fn(),
    };
});

function toOcrLines(texts: string[]): OcrLine[] {
    return texts.map((text) => ({ text, confidence: 80 }));
}

function createMockCamera(frame: HTMLCanvasElement | null = document.createElement('canvas')) {
    return {
        captureFrame: vi.fn().mockReturnValue(frame),
        start: vi.fn(),
        stop: vi.fn(),
        verifyReadiness: vi.fn().mockResolvedValue(undefined),
    };
}

function createMockOcr(lines: string[] = []) {
    return {
        recognize: vi.fn().mockResolvedValue(toOcrLines(lines)),
        resetProcessing: vi.fn(),
        init: vi.fn(),
        destroy: vi.fn(),
        verifyReadiness: vi.fn().mockResolvedValue(undefined),
    };
}

function createMockBookSearcher(books: state.Book[] = []) {
    return {
        search: vi.fn().mockResolvedValue(books),
        preloadBookId: vi.fn(),
        removeBookId: vi.fn(),
        clear: vi.fn(),
    };
}

function makeBook(id: string, title: string): state.Book {
    return {
        id,
        title,
        authors: [],
        publisher: null,
        publishedDate: null,
        description: null,
        isbn: null,
        pageCount: null,
        thumbnailUrl: null,
        infoLink: null,
        confidence: 0,
    };
}

describe('scanner', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        // Reset state
        state.update({
            books: [],
            candidateBooks: [],
            candidateFilter: '',
            isScanning: false,
            autoScan: false,
            scanCount: 0,
            lastDetectedText: '',
            error: null,
            view: 'home',
            isProcessingImage: false,
            ocrReady: false,
            ocrLanguage: 'ron',
            isChangingLanguage: false,
        });
    });

    afterEach(() => {
        stopScanning();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    describe('startScanning', () => {
        it('sets isScanning to true', () => {
            const camera = createMockCamera();
            const ocr = createMockOcr();
            const books = createMockBookSearcher();

            startScanning(camera as any, ocr as any, books as any);

            expect(state.getState().isScanning).toBe(true);
        });

        it('schedules scan when autoScan is true', async () => {
            state.update({ autoScan: true });
            const camera = createMockCamera();
            const ocr = createMockOcr(['Some text']);
            const books = createMockBookSearcher();

            startScanning(camera as any, ocr as any, books as any);
            await vi.advanceTimersByTimeAsync(2000);

            expect(camera.captureFrame).toHaveBeenCalled();
            expect(ocr.recognize).toHaveBeenCalled();
        });

        it('does not schedule scan when autoScan is false', async () => {
            state.update({ autoScan: false });

            const camera = createMockCamera();
            const ocr = createMockOcr();
            const books = createMockBookSearcher();

            startScanning(camera as any, ocr as any, books as any);
            await vi.advanceTimersByTimeAsync(2000);

            expect(camera.captureFrame).not.toHaveBeenCalled();
        });

        it('increments scanCount on successful scan', async () => {
            state.update({ autoScan: true });
            const camera = createMockCamera();
            const ocr = createMockOcr(['Hello']);
            const books = createMockBookSearcher();

            startScanning(camera as any, ocr as any, books as any);
            await vi.advanceTimersByTimeAsync(2000);

            expect(state.getState().scanCount).toBe(1);
        });

        it('adds found books as candidates', async () => {
            state.update({ autoScan: true });
            const book = makeBook('v1', 'Found Book');
            const camera = createMockCamera();
            const ocr = createMockOcr(['book title']);
            const books = createMockBookSearcher([book]);

            startScanning(camera as any, ocr as any, books as any);
            await vi.advanceTimersByTimeAsync(2000);

            expect(state.getState().candidateBooks).toHaveLength(1);
            expect(state.getState().candidateBooks[0].title).toBe('Found Book');
        });

    describe('scanOnce', () => {
        it('successfully scans and finds books', async () => {
            state.update({ autoScan: false });
            const book = makeBook('v1', 'Found Book');
            const canvas = document.createElement('canvas');
            const camera = createMockCamera(canvas);
            const ocr = createMockOcr(['Book Title']);
            const books = createMockBookSearcher([book]);

            await scanOnce(camera as any, ocr as any, books as any);

            expect(state.getState().scanCount).toBe(1);
            expect(state.getState().candidateBooks).toHaveLength(1);
        });

        it('fails when camera fails to capture frame', async () => {
            const camera = createMockCamera(null);
            const ocr = createMockOcr();
            const books = createMockBookSearcher();

            await scanOnce(camera as any, ocr as any, books as any);

            expect(state.getState().scanCount).toBe(0);
        });

        it('handles OCR error', async () => {
            const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
            const canvas = document.createElement('canvas');
            const camera = createMockCamera(canvas);
            const ocr = createMockOcr(['Title']);
            (ocr.recognize as any).mockRejectedValueOnce(new Error('OCR failed'));
            const books = createMockBookSearcher();

            await scanOnce(camera as any, ocr as any, books as any);

            expect(state.getState().scanCount).toBe(0);
            expect(consoleError).toHaveBeenCalledWith('Scan once error:', expect.any(Error));
        });
    });
    });

    describe('stopScanning', () => {
        it('sets isScanning to false', () => {
            const camera = createMockCamera();
            startScanning(camera as any, createMockOcr() as any, createMockBookSearcher() as any);
            stopScanning();
            expect(state.getState().isScanning).toBe(false);
        });

        it('stops scheduled scans', async () => {
            state.update({ autoScan: true });
            const camera = createMockCamera();
            const ocr = createMockOcr();

            startScanning(camera as any, ocr as any, createMockBookSearcher() as any);
            stopScanning();
            await vi.advanceTimersByTimeAsync(2000);

            expect(camera.captureFrame).not.toHaveBeenCalled();
        });
    });

    describe('scanOnce', () => {
        it('captures a single frame and runs OCR', async () => {
            const camera = createMockCamera();
            const ocr = createMockOcr(['Some text']);
            const books = createMockBookSearcher();

            await scanOnce(camera as any, ocr as any, books as any);

            expect(camera.captureFrame).toHaveBeenCalledTimes(1);
            expect(ocr.recognize).toHaveBeenCalledTimes(1);
            // Single line: combined query equals the line, no duplicate individual query
            expect(books.search).toHaveBeenCalledWith('Some text');
            expect(books.search).toHaveBeenCalledTimes(1);
        });

        it('toasts "No text detected" and adds no candidates when OCR returns empty', async () => {
            const camera = createMockCamera();
            const ocr = createMockOcr([]); // frame captured OK, but OCR found nothing
            const books = createMockBookSearcher();

            await scanOnce(camera as any, ocr as any, books as any);

            expect(state.toast).toHaveBeenCalledWith('No text detected');
            expect(state.getState().candidateBooks).toHaveLength(0);
            // Frame was captured and passed brightness check (mockBrightness=128), so OCR ran.
            // But no lines → no search queries fired, no candidates added.
            expect(books.search).not.toHaveBeenCalled();
        });

        it('increments scanCount', async () => {
            const camera = createMockCamera();
            const ocr = createMockOcr(['text']);
            const books = createMockBookSearcher();

            await scanOnce(camera as any, ocr as any, books as any);
            expect(state.getState().scanCount).toBe(1);
        });

        it('shows toast when no text detected', async () => {
            const camera = createMockCamera();
            const ocr = createMockOcr([]);
            const books = createMockBookSearcher();

            await scanOnce(camera as any, ocr as any, books as any);
            expect(state.toast).toHaveBeenCalledWith('No text detected');
        });

        it('shows toast when text found but no new books', async () => {
            const camera = createMockCamera();
            const ocr = createMockOcr(['some query']);
            const books = createMockBookSearcher([]); // no books returned

            await scanOnce(camera as any, ocr as any, books as any);
            expect(state.toast).toHaveBeenCalledWith('No new books found');
        });

        it('toasts when captureFrame returns null', async () => {
            const camera = createMockCamera(null);
            const ocr = createMockOcr();
            const books = createMockBookSearcher();

            await scanOnce(camera as any, ocr as any, books as any);
            expect(state.toast).toHaveBeenCalledWith('Could not capture frame');
        });

        it('handles OCR timeout by toasting and resetting processing', async () => {
            const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
            const camera = createMockCamera();
            const ocr = createMockOcr(['text']);
            const books = createMockBookSearcher();
            ocr.recognize.mockRejectedValue(new Error('OCR timed out'));

            await scanOnce(camera as any, ocr as any, books as any);

            expect(state.toast).toHaveBeenCalledWith('OCR timed out — retrying on next scan.');
            expect(ocr.resetProcessing).toHaveBeenCalled();
            expect(consoleError).toHaveBeenCalledWith('Scan once error:', expect.any(Error));
        });
    });

    describe('resumeAutoScan', () => {
        it('starts the scan loop when conditions are met', async () => {
            const camera = createMockCamera();
            const ocr = createMockOcr(['text']);
            const books = createMockBookSearcher();

            // Start scanning without auto-scan
            state.update({ autoScan: false });
            startScanning(camera as any, ocr as any, books as any);

            // Now enable auto-scan and resume
            state.update({ autoScan: true });
            resumeAutoScan(camera as any, ocr as any, books as any);

            await vi.advanceTimersByTimeAsync(2000);
            expect(camera.captureFrame).toHaveBeenCalled();
        });

        it('does nothing when not scanning', () => {
            const camera = createMockCamera();
            state.update({ autoScan: true, isScanning: false });
            resumeAutoScan(camera as any, createMockOcr() as any, createMockBookSearcher() as any);
            // Should not throw or start scanning
        });
    });

    describe('pauseAutoScan', () => {
        it('stops the auto-scan loop', async () => {
            state.update({ autoScan: true });
            const camera = createMockCamera();
            const ocr = createMockOcr();
            const books = createMockBookSearcher();

            startScanning(camera as any, ocr as any, books as any);
            pauseAutoScan();

            await vi.advanceTimersByTimeAsync(2000);
            expect(camera.captureFrame).not.toHaveBeenCalled();
        });
    });

    describe('visibility change', () => {
        it('pauses scanning when tab is hidden', async () => {
            state.update({ autoScan: true });
            const camera = createMockCamera();
            const ocr = createMockOcr(['text']);
            const books = createMockBookSearcher();

            startScanning(camera as any, ocr as any, books as any);

            // Simulate tab hidden
            Object.defineProperty(document, 'hidden', { value: true, configurable: true });
            document.dispatchEvent(new Event('visibilitychange'));

            await vi.advanceTimersByTimeAsync(2000);
            expect(camera.captureFrame).not.toHaveBeenCalled();

            // Simulate tab visible
            Object.defineProperty(document, 'hidden', { value: false, configurable: true });
            document.dispatchEvent(new Event('visibilitychange'));

            await vi.advanceTimersByTimeAsync(2000);
            expect(camera.captureFrame).toHaveBeenCalled();
        });
    });

    describe('searchTextBlocks', () => {
        it('sends combined query from all lines', async () => {
            const books = createMockBookSearcher();
            await searchTextBlocks(toOcrLines(['line one', 'line two', 'line three']), books as any);

            expect(books.search).toHaveBeenCalledWith('line one line two line three');
        });

        it('also searches individual lines >= 8 chars', async () => {
            const books = createMockBookSearcher();
            await searchTextBlocks(toOcrLines(['line one', 'line two', 'line three']), books as any);

            // combined + 3 individual long lines = 4 total
            expect(books.search).toHaveBeenCalledTimes(4);
            expect(books.search).toHaveBeenCalledWith('line one');
            expect(books.search).toHaveBeenCalledWith('line two');
            expect(books.search).toHaveBeenCalledWith('line three');
        });

        it('does not send individual lines shorter than 8 chars', async () => {
            const books = createMockBookSearcher();
            // 'hi' (2), 'short' (5), 'text1' (5) — all < 8 chars individually
            await searchTextBlocks(toOcrLines(['hi', 'short', 'text1']), books as any);

            // Only the combined query is sent
            expect(books.search).toHaveBeenCalledTimes(1);
            expect(books.search).toHaveBeenCalledWith('hi short text1');
        });

        it('skips purely whitespace lines and does not trigger search if no content left', async () => {
            const books = createMockBookSearcher();
            await searchTextBlocks(toOcrLines(['  ', '   ']), books as any);

            expect(books.search).not.toHaveBeenCalled();
        });

        it('updates lastDetectedText only once with first block', async () => {
            const books = createMockBookSearcher();
            await searchTextBlocks(toOcrLines(['first', 'second', 'third']), books as any);

            expect(state.getState().lastDetectedText).toBe('first');
        });

        it('returns empty array for no text blocks', async () => {
            const books = createMockBookSearcher();
            const result = await searchTextBlocks([], books as any);
            expect(result).toEqual([]);
        });

        it('aggregates books from combined and individual queries', async () => {
            const book1 = makeBook('b1', 'Book One');
            const book2 = makeBook('b2', 'Book Two');
            const books = createMockBookSearcher();
            // 'longtext1' (9 chars) qualifies as individual; 'short' (5 chars) does not
            // → combined='longtext1 short' + individual='longtext1' = 2 queries
            books.search
                .mockResolvedValueOnce([book1])
                .mockResolvedValueOnce([book2]);

            const result = await searchTextBlocks(toOcrLines(['longtext1', 'short']), books as any);
            expect(result).toHaveLength(2);
            expect(result[0].title).toBe('Book One');
            expect(result[1].title).toBe('Book Two');
        });

        it('limits total queries to MAX_QUERIES_PER_SCAN', async () => {
            const books = createMockBookSearcher();
            // 1 combined + 5 long individuals = 6 queries total, should be capped to 5
            await searchTextBlocks(toOcrLines(['longline1', 'longline2', 'longline3', 'longline4', 'longline5', 'longline6']), books as any);

            expect(books.search).toHaveBeenCalledTimes(5);
        });

        it('handles search failures gracefully', async () => {
            const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
            const book1 = makeBook('b1', 'Book One');
            const books = createMockBookSearcher();
            // 'longtext1' (9 chars) qualifies as individual → 2 queries
            books.search
                .mockResolvedValueOnce([book1])
                .mockRejectedValueOnce(new Error('API error'));

            const result = await searchTextBlocks(toOcrLines(['longtext1', 'short']), books as any);
            expect(result).toHaveLength(1);
            expect(result[0].title).toBe('Book One');
            expect(consoleError).toHaveBeenCalledWith('Search failed for query "longtext1":', expect.any(Error));
        });

        it('does not send duplicate query when single line equals combined query (>= 8 chars)', async () => {
            const book1 = makeBook('b1', 'Book One');
            const books = createMockBookSearcher();
            books.search.mockResolvedValueOnce([book1]);

            // Single long line: combined === the line itself → excluded from individuals
            await searchTextBlocks(toOcrLines(['Single Long Line']), books as any);

            expect(books.search).toHaveBeenCalledTimes(1);
            expect(books.search).toHaveBeenCalledWith('Single Long Line');
        });

        it('does not send duplicate query when single short line (< 8 chars)', async () => {
            const books = createMockBookSearcher();

            // Single short line: combined === the line → excluded; also < 8 chars anyway
            await searchTextBlocks(toOcrLines(['hi']), books as any);

            expect(books.search).toHaveBeenCalledTimes(1);
            expect(books.search).toHaveBeenCalledWith('hi');
        });

        it('deduplicates identical individual queries from duplicate OCR lines', async () => {
            const book1 = makeBook('b1', 'Book One');
            const books = createMockBookSearcher();
            // Two identical long lines: Set-dedup ensures only 1 individual query, not 2 — combined + 1 unique individual = 2 queries total
            await searchTextBlocks(toOcrLines(['abcdefghij', 'abcdefghij']), books as any);

            expect(books.search).toHaveBeenCalledTimes(2);
        });

        it('does not send duplicate individual query when OCR line appears multiple times in input', async () => {
            const book1 = makeBook('b1', 'Book One');
            const books = createMockBookSearcher();
            // Three lines where one repeats: 3 raw individuals → Set-dedup to 2 unique + 1 combined = 3 queries total (not 4)
            await searchTextBlocks(toOcrLines(['abcdefghij', 'klmnopqrst', 'abcdefghij']), books as any);

            expect(books.search).toHaveBeenCalledTimes(3);
        });

        it('filters out short individual lines (< 8 chars) but still uses them in combined query', async () => {
            const book1 = makeBook('b1', 'Book One');
            const books = createMockBookSearcher();
            // Combined query includes all non-empty trimmed text; only individuals >= 8 chars are sent separately
            await searchTextBlocks(toOcrLines(['abcdefghij', 'hi', 'short']), books as any);

            expect(books.search).toHaveBeenCalledTimes(2);
            expect(books.search).toHaveBeenCalledWith('abcdefghij hi short'); // combined
            expect(books.search).toHaveBeenCalledWith('abcdefghij'); // individual >= 8 chars
        });

        it('sends only the combined query when all lines are shorter than 8 characters', async () => {
            const book1 = makeBook('b1', 'Book One');
            const books = createMockBookSearcher();
            await searchTextBlocks(toOcrLines(['ab', 'cd', 'ef']), books as any);

            expect(books.search).toHaveBeenCalledTimes(1);
            expect(books.search).toHaveBeenCalledWith('ab cd ef');
        });

        it('uses boundary-length line (exactly 7 chars) as individual only when >= 8 chars threshold', async () => {
            const book1 = makeBook('b1', 'Book One');
            const books = createMockBookSearcher();
            // 'abcdefg' is 7 chars (< 8), should NOT appear as individual; combined still includes it
            await searchTextBlocks(toOcrLines(['abcdefghi', 'abcdefg']), books as any);

            expect(books.search).toHaveBeenCalledTimes(2);
            expect(books.search).toHaveBeenCalledWith('abcdefghi abcdefg'); // combined
            expect(books.search).toHaveBeenCalledWith('abcdefghi'); // individual >= 8 chars (9)
            expect(books.search).not.toHaveBeenCalledWith('abcdefg'); // excluded (< 8)
        });
    });

    describe('dark-frame skip', () => {
        it('does not run OCR when frame brightness is below MIN_BRIGHTNESS', async () => {
            const spy = vi.spyOn(ocrModule, 'frameBrightness').mockReturnValue(0);

            state.update({ autoScan: true });
            const camera = createMockCamera();
            const ocr = createMockOcr(['text']);
            const books = createMockBookSearcher();

            startScanning(camera as any, ocr as any, books as any);

            await vi.advanceTimersByTimeAsync(2000);

            expect(camera.captureFrame).toHaveBeenCalled();
            expect(ocr.recognize).not.toHaveBeenCalled();

            spy.mockRestore();
        });
    });

    describe('auto-scan error recovery', () => {
        it('recovers the scan loop after camera.verifyReadiness rejects', async () => {
            state.update({ autoScan: true });
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            const camera = createMockCamera();
            const ocr = createMockOcr(['text']);
            const books = createMockBookSearcher();

            // verifyReadiness throws on first call; second call succeeds
            (camera.verifyReadiness as any)
                .mockRejectedValueOnce(new Error('camera unavailable'))
                .mockResolvedValue(undefined);

            startScanning(camera as any, ocr as any, books as any);

            await vi.advanceTimersByTimeAsync(2000);

            // First scan: verifyReadiness rejected → no frame capture, no OCR, scanCount unchanged
            expect(state.getState().scanCount).toBe(0);
            expect(camera.captureFrame).not.toHaveBeenCalled();
            expect(ocr.recognize).not.toHaveBeenCalled();
            expect(consoleSpy).toHaveBeenCalledWith('Scan frame error:', expect.any(Error));

            // scheduleNext runs unconditionally after errors (line 173), so advancing again should resume scanning
            await vi.advanceTimersByTimeAsync(2000);

            expect(camera.captureFrame).toHaveBeenCalled();
            expect(ocr.recognize).toHaveBeenCalled();
        });

        it('recovers the scan loop after ocr.verifyReadiness rejects', async () => {
            state.update({ autoScan: true });
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            const camera = createMockCamera();
            const ocr = createMockOcr(['text']);
            const books = createMockBookSearcher();

            // First call to OCR verifyReadiness throws; second succeeds
            (ocr.verifyReadiness as any)
                .mockRejectedValueOnce(new Error('tesseract busy'))
                .mockResolvedValue(undefined);

            startScanning(camera as any, ocr as any, books as any);

            await vi.advanceTimersByTimeAsync(2000);

            expect(state.getState().scanCount).toBe(0);
            expect(consoleSpy).toHaveBeenCalledWith('Scan frame error:', expect.any(Error));

            // Second interval resumes normal scanning after scheduleNext runs from the catch block
            await vi.advanceTimersByTimeAsync(2000);

            expect(camera.captureFrame).toHaveBeenCalled();
        });
    });

    describe('candidate popup pausing', () => {
        it('skips scanning while candidateBooks are present', async () => {
            state.update({ autoScan: true });
            const camera = createMockCamera();
            const ocr = createMockOcr(['text']);
            const books = createMockBookSearcher();

            startScanning(camera as any, ocr as any, books as any);

            // Add a candidate to simulate popup being visible
            state.addCandidates([makeBook('c1', 'Candidate Book')]);

            await vi.advanceTimersByTimeAsync(2000);

            expect(camera.captureFrame).not.toHaveBeenCalled();
        });

        it('resumes scanning after candidates are cleared', async () => {
            state.update({ autoScan: true });
            const camera = createMockCamera();
            const ocr = createMockOcr(['text']);
            const books = createMockBookSearcher();

            startScanning(camera as any, ocr as any, books as any);

            state.addCandidates([makeBook('c1', 'Candidate Book')]);
            await vi.advanceTimersByTimeAsync(2000);
            expect(camera.captureFrame).not.toHaveBeenCalled();

            // Clear candidates (simulates dismiss)
            state.clearCandidates();

            await vi.advanceTimersByTimeAsync(2000);
            expect(camera.captureFrame).toHaveBeenCalled();
        });

        it('resumes scanning after last candidate is individually added', async () => {
            state.update({ autoScan: true });
            const camera = createMockCamera();
            const ocr = createMockOcr(['text']);
            const books = createMockBookSearcher();

            startScanning(camera as any, ocr as any, books as any);

            state.addCandidates([makeBook('c1', 'Book One')]);
            await vi.advanceTimersByTimeAsync(2000);
            expect(camera.captureFrame).not.toHaveBeenCalled();

            // Remove the one candidate (simulates user clicking "Add")
            state.removeCandidateById('c1');

            await vi.advanceTimersByTimeAsync(2000);
            expect(camera.captureFrame).toHaveBeenCalled();
        });

        it('does not block scanOnce while candidates are present', async () => {
            state.addCandidates([makeBook('c1', 'Candidate Book')]);
            const camera = createMockCamera();
            const ocr = createMockOcr(['text']);
            const books = createMockBookSearcher();

            await scanOnce(camera as any, ocr as any, books as any);

            expect(camera.captureFrame).toHaveBeenCalledTimes(1);
            expect(ocr.recognize).toHaveBeenCalledTimes(1);
        });
    });
});
