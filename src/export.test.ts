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

    it('quotes fields that contain carriage returns', async () => {
        exportToCsv([makeBook({ title: 'Line 1\rLine 2' })]);

        expect(capturedBlob).not.toBeNull();
        await expect(capturedBlob!.text()).resolves.toContain('"Line 1\rLine 2"');
    });

    it('quotes fields that contain newlines', async () => {
        exportToCsv([makeBook({ title: 'Line 1\nLine 2' })]);

        expect(capturedBlob).not.toBeNull();
        await expect(capturedBlob!.text()).resolves.toContain('"Line 1\nLine 2"');
    });

    it('quotes fields that contain double quotes', async () => {
        exportToCsv([makeBook({ title: 'A "famous" Book' })]);

        expect(capturedBlob).not.toBeNull();
        await expect(capturedBlob!.text()).resolves.toContain('"A ""famous"" Book"');
    });

    it('quotes fields that contain commas', async () => {
        exportToCsv([makeBook({ title: 'Title, with comma' })]);

        expect(capturedBlob).not.toBeNull();
        await expect(capturedBlob!.text()).resolves.toContain('"Title, with comma"');
    });

    it('revokes object URL after download', () => {
        exportToCsv([makeBook()]);
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    });

    it('produces CSV with correct header and field order for a normal book', async () => {
        const book = makeBook({ title: 'The Great Book', isbn: '0-123456-78-9' });
        exportToCsv([book]);

        expect(capturedBlob).not.toBeNull();
        const text = await capturedBlob!.text();
        expect(text).toMatch(/^Title,Authors,ISBN,Publisher,Published Date,Page Count\r?\n/);
        const lines = text.split(/\r?\n/);
        expect(lines[1]).toBe('The Great Book,Author A,0-123456-78-9,Publisher Co,2024-01-01,300');
    });

    it('produces empty cells for null optional fields and "0" for zero page count', async () => {
        const book = makeBook({ isbn: null, publisher: null, publishedDate: null, pageCount: 0 });
        exportToCsv([book]);

        expect(capturedBlob).not.toBeNull();
        const text = await capturedBlob!.text();
        // title, authors, empty isbn, empty publisher, empty date, "0" for zero page count — 5 commas
        expect(text).toBe('Title,Authors,ISBN,Publisher,Published Date,Page Count\nTest Book,Author A,,,,0');
    });

    it('produces one row per book for multiple books', async () => {
        const books = [makeBook({ title: 'Alpha' }), makeBook({ id: 'b2', title: 'Beta' })];
        exportToCsv(books);

        expect(capturedBlob).not.toBeNull();
        const text = await capturedBlob!.text();
        const lines = text.split(/\r?\n/);
        // header + 2 data rows = 3 lines
        expect(lines.length).toBe(3);
        expect(lines[1]).toContain('Alpha');
        expect(lines[2]).toContain('Beta');
    });
});

describe('formatBooksAsText', () => {
    it('formats a single book with title, authors, ISBN, and page count', () => {
        const result = formatBooksAsText([makeBook()]);
        expect(result).toBe('# My Book Collection\nAuthor A - Test Book | ISBN: 9781234567890 | 300 pages');
    });

    it('joins multiple authors with comma', () => {
        const result = formatBooksAsText([makeBook({ authors: ['Alice', 'Bob'] })]);
        expect(result).toBe('# My Book Collection\nAlice, Bob - Test Book | ISBN: 9781234567890 | 300 pages');
    });

    it('uses "Unknown" when no authors', () => {
        const result = formatBooksAsText([makeBook({ authors: [] })]);
        expect(result).toBe('# My Book Collection\nUnknown - Test Book | ISBN: 9781234567890 | 300 pages');
    });

    it('omits ISBN when missing', () => {
        const result = formatBooksAsText([makeBook({ isbn: null })]);
        expect(result).toBe('# My Book Collection\nAuthor A - Test Book | 300 pages');
    });

    it('omits page count when zero or negative', () => {
        const result = formatBooksAsText([makeBook({ pageCount: 0 })]);
        expect(result).not.toContain('pages');
    });

    it('includes each book on its own line', () => {
        const books = [
            makeBook({ title: 'Book One' }),
            makeBook({ id: 'b2', title: 'Book Two', authors: ['Writer X'] }),
        ];
        const result = formatBooksAsText(books);
        expect(result).toContain('# My Book Collection');
        expect(result).toContain('Author A - Book One');
        expect(result).toContain('Writer X - Book Two');
    });

    it('returns only the header for empty array', () => {
        expect(formatBooksAsText([])).toBe('# My Book Collection');
    });

    it('outputs only author-title when ISBN and page count are absent', () => {
        const result = formatBooksAsText([makeBook({ isbn: null, pageCount: 0 })]);
        expect(result).toBe('# My Book Collection\nAuthor A - Test Book');
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
            text: '# My Book Collection\nAuthor A - Test Book | ISBN: 9781234567890 | 300 pages',
        });
    });

    it('falls back to clipboard when share is not available', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        vi.stubGlobal('navigator', { ...navigator, share: undefined, clipboard: { writeText } });

        await shareBooks([makeBook()], notify);
        expect(writeText).toHaveBeenCalledWith('# My Book Collection\nAuthor A - Test Book | ISBN: 9781234567890 | 300 pages');
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

    it('does not fall back to clipboard when share throws plain Error AbortError', async () => {
        const abortErr = new Error('Share canceled') as Error & { name: string };
        abortErr.name = 'AbortError';
        const shareFn = vi.fn().mockRejectedValue(abortErr);
        const writeText = vi.fn();
        vi.stubGlobal('navigator', { ...navigator, share: shareFn, clipboard: { writeText } });

        await shareBooks([makeBook()], notify);
        expect(writeText).not.toHaveBeenCalled();
        expect(notify).not.toHaveBeenCalled();
    });

    it('notifies when neither share nor clipboard is available', async () => {
        vi.stubGlobal('navigator', { ...navigator, share: undefined, clipboard: undefined });

        await expect(shareBooks([makeBook()], notify)).resolves.toBeUndefined();
        expect(notify).toHaveBeenCalledWith('Could not share or copy book list');
    });
});
