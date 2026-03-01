import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { exportToCsv } from './export';
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
