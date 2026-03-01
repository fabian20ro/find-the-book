import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startScanning, stopScanning, scanOnce, resumeAutoScan, pauseAutoScan, searchTextBlocks } from './scanner';
import * as state from './state';

// Mock state module
vi.mock('./state', async () => {
    const actual = await vi.importActual<typeof state>('./state');
    return {
        ...actual,
        toast: vi.fn(),
    };
});

function createMockCamera(frame: HTMLCanvasElement | null = document.createElement('canvas')) {
    return {
        captureFrame: vi.fn().mockReturnValue(frame),
        start: vi.fn(),
        stop: vi.fn(),
    };
}

function createMockOcr(lines: string[] = []) {
    return {
        recognize: vi.fn().mockResolvedValue(lines),
        resetProcessing: vi.fn(),
        init: vi.fn(),
        destroy: vi.fn(),
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

        it('handles OCR timeout', async () => {
            const camera = createMockCamera();
            const ocr = createMockOcr();
            ocr.recognize.mockRejectedValue(new Error('OCR timed out'));
            const books = createMockBookSearcher();

            // scanOnce uses withTimeout internally, but the mock rejects immediately
            // However we're mocking recognize to reject with 'OCR timed out'
            // The scanOnce function catches this and toasts
            await scanOnce(camera as any, ocr as any, books as any);
            // It should handle the error gracefully (not throw)
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
            await searchTextBlocks(['line one', 'line two', 'line three'], books as any);

            expect(books.search).toHaveBeenCalledWith('line one line two line three');
        });

        it('also searches individual lines >= 8 chars', async () => {
            const books = createMockBookSearcher();
            await searchTextBlocks(['line one', 'line two', 'line three'], books as any);

            // combined + 3 individual long lines = 4 total
            expect(books.search).toHaveBeenCalledTimes(4);
            expect(books.search).toHaveBeenCalledWith('line one');
            expect(books.search).toHaveBeenCalledWith('line two');
            expect(books.search).toHaveBeenCalledWith('line three');
        });

        it('does not send individual lines shorter than 8 chars', async () => {
            const books = createMockBookSearcher();
            // 'hi' (2), 'short' (5), 'text1' (5) — all < 8 chars individually
            await searchTextBlocks(['hi', 'short', 'text1'], books as any);

            // Only the combined query is sent
            expect(books.search).toHaveBeenCalledTimes(1);
            expect(books.search).toHaveBeenCalledWith('hi short text1');
        });

        it('does not duplicate query when single line equals combined', async () => {
            const books = createMockBookSearcher();
            await searchTextBlocks(['Some text'], books as any);

            expect(books.search).toHaveBeenCalledTimes(1);
            expect(books.search).toHaveBeenCalledWith('Some text');
        });

        it('updates lastDetectedText only once with first block', async () => {
            const books = createMockBookSearcher();
            await searchTextBlocks(['first', 'second', 'third'], books as any);

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

            const result = await searchTextBlocks(['longtext1', 'short'], books as any);
            expect(result).toHaveLength(2);
            expect(result[0].title).toBe('Book One');
            expect(result[1].title).toBe('Book Two');
        });

        it('handles search failures gracefully', async () => {
            const book1 = makeBook('b1', 'Book One');
            const books = createMockBookSearcher();
            // 'longtext1' (9 chars) qualifies as individual → 2 queries
            books.search
                .mockResolvedValueOnce([book1])
                .mockRejectedValueOnce(new Error('API error'));

            const result = await searchTextBlocks(['longtext1', 'short'], books as any);
            expect(result).toHaveLength(1);
            expect(result[0].title).toBe('Book One');
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
