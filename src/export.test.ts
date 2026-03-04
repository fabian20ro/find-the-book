import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { exportToCsv, shareBooks, formatBooksAsText } from './export';
import type { Book } from './books';

function makeBook(overrides: Partial<Book> = {}): Book {
    return {
        id: 'b1',
        title: 'Test Book',
        authors: ['Author A'],
        publisher: 'Publisher Co',
        publishedDate: '2024-01-01',
        description: 'A description',
        isbn: '9781234567890',
        pageCount: 300,
        thumbnailUrl: null,
        infoLink: null,
        confidence: 75,
        ...overrides,
    };
}

describe('exportToCsv', () => {
    let capturedBlob: Blob | null;
    let clickedDownload: string | null;

    beforeEach(() => {
        capturedBlob = null;
        clickedDownload = null;

        vi.spyOn(URL, 'createObjectURL').mockImplementation((obj: Blob | MediaSource) => {
            capturedBlob = obj as Blob;
            return 'blob:mock-url';
        });
        vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

        // Intercept the anchor click
        const origCreateElement = document.createElement.bind(document);
        vi.spyOn(document, 'createElement').mockImplementation((tag: string, options?: any) => {
            const el = origCreateElement(tag, options);
            if (tag === 'a') {
                vi.spyOn(el as HTMLAnchorElement, 'click').mockImplementation(() => {
                    clickedDownload = (el as HTMLAnchorElement).download;
                });
            }
            return el;
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('does nothing when book array is empty', () => {
        exportToCsv([]);
        expect(URL.createObjectURL).not.toHaveBeenCalled();
    });

    it('creates CSV download with correct filename', () => {
        exportToCsv([makeBook()]);
        expect(clickedDownload).toBe('found_books.csv');
    });

    it('creates a Blob with CSV content', () => {
        exportToCsv([makeBook()]);
        expect(capturedBlob).not.toBeNull();
        expect(capturedBlob!.type).toBe('text/csv;charset=utf-8;');
    });

    it('creates CSV with multiple books', () => {
        const books = [
            makeBook({ title: 'Book One', isbn: '111' }),
            makeBook({ id: 'b2', title: 'Book Two', isbn: '222' }),
        ];
        exportToCsv(books);
        expect(capturedBlob).not.toBeNull();
    });

    it('revokes object URL after download', () => {
        exportToCsv([makeBook()]);
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    });
});

describe('formatBooksAsText', () => {
    it('formats a single book as "authors - title"', () => {
        const result = formatBooksAsText([makeBook()]);
        expect(result).toBe('Author A - Test Book');
    });

    it('joins multiple authors with comma', () => {
        const result = formatBooksAsText([makeBook({ authors: ['Alice', 'Bob'] })]);
        expect(result).toBe('Alice, Bob - Test Book');
    });

    it('uses "Unknown" when no authors', () => {
        const result = formatBooksAsText([makeBook({ authors: [] })]);
        expect(result).toBe('Unknown - Test Book');
    });

    it('puts each book on its own line', () => {
        const books = [
            makeBook({ title: 'Book One' }),
            makeBook({ id: 'b2', title: 'Book Two', authors: ['Writer X'] }),
        ];
        const result = formatBooksAsText(books);
        expect(result).toBe('Author A - Book One\nWriter X - Book Two');
    });

    it('returns empty string for empty array', () => {
        expect(formatBooksAsText([])).toBe('');
    });
});

describe('shareBooks', () => {
    let notify: ReturnType<typeof vi.fn<(msg: string) => void>>;

    beforeEach(() => {
        notify = vi.fn<(msg: string) => void>();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('does nothing when book array is empty', async () => {
        await shareBooks([], notify);
        expect(notify).not.toHaveBeenCalled();
    });

    it('uses navigator.share when available', async () => {
        const shareFn = vi.fn().mockResolvedValue(undefined);
        vi.stubGlobal('navigator', { ...navigator, share: shareFn });

        await shareBooks([makeBook()], notify);
        expect(shareFn).toHaveBeenCalledWith({
            title: 'My Book Collection',
            text: 'Author A - Test Book',
        });
    });

    it('falls back to clipboard when share is not available', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        vi.stubGlobal('navigator', { ...navigator, share: undefined, clipboard: { writeText } });

        await shareBooks([makeBook()], notify);
        expect(writeText).toHaveBeenCalledWith('Author A - Test Book');
        expect(notify).toHaveBeenCalledWith('Book list copied to clipboard');
    });

    it('falls back to clipboard when share throws non-abort error', async () => {
        const shareFn = vi.fn().mockRejectedValue(new Error('Share failed'));
        const writeText = vi.fn().mockResolvedValue(undefined);
        vi.stubGlobal('navigator', { ...navigator, share: shareFn, clipboard: { writeText } });

        await shareBooks([makeBook()], notify);
        expect(writeText).toHaveBeenCalled();
        expect(notify).toHaveBeenCalledWith('Book list copied to clipboard');
    });

    it('does not fall back to clipboard when user cancels share', async () => {
        const abortErr = new DOMException('Share canceled', 'AbortError');
        const shareFn = vi.fn().mockRejectedValue(abortErr);
        const writeText = vi.fn();
        vi.stubGlobal('navigator', { ...navigator, share: shareFn, clipboard: { writeText } });

        await shareBooks([makeBook()], notify);
        expect(writeText).not.toHaveBeenCalled();
        expect(notify).not.toHaveBeenCalled();
    });

    it('notifies on clipboard failure', async () => {
        const writeText = vi.fn().mockRejectedValue(new Error('Clipboard failed'));
        vi.stubGlobal('navigator', { ...navigator, share: undefined, clipboard: { writeText } });

        await shareBooks([makeBook()], notify);
        expect(notify).toHaveBeenCalledWith('Could not share or copy book list');
    });
});
