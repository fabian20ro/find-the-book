import { describe, it, expect, beforeAll, vi } from 'vitest';

describe('parsing stored books', () => {
    let parseStoredBooks: (s: string | null) => any;

    beforeAll(async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        document.body.innerHTML = `
            <div id="home-view" hidden>
                <div id="ocr-status"></div>
                <div id="home-processing" hidden></div>
                <div id="home-book-count"></div>
                <div id="home-book-list"></div>
                <button id="btn-home-share"></button>
                <button id="btn-home-export"></button>
                <button id="btn-home-clear"></button>
                <button id="btn-start-camera"></button>
                <button id="btn-upload-image"></button>
                <input type="file" id="photo-input" hidden accept="image/*">
            </div>
            <div id="scan-view" hidden>
                <video id="camera"></video>
                <canvas id="capture"></canvas>
                <div id="status-overlay"></div>
                <div id="scan-count"></div>
                <div id="scan-status"></div>
                <div id="last-text"></div>
                <button id="btn-back"></button>
                <button id="auto-scan-switch" disabled></button>
                <button id="btn-scan-now"></button>
                <div id="scan-book-count"></div>
            </div>
            <div id="book-popup" hidden>
                <div class="book-popup-backdrop"></div>
                <h2 class="book-popup-title"></h2>
                <div id="book-popup-list"></div>
                <button id="btn-popup-dismiss"></button>
                <input type="text" id="candidate-search">
            </div>
            <div id="language-selector" hidden>
                <div class="lang-grid"></div>
            </div>
            <div id="error-overlay" hidden>
                <div id="error-message"></div>
                <button id="btn-retry"></button>
            </div>
        `;
        const module = await import('./app');
        parseStoredBooks = module.parseStoredBooks;
        await vi.waitFor(() => {
            expect(consoleError).toHaveBeenCalledWith('OCR preload failed:', expect.any(Error));
        });
        consoleError.mockRestore();
    });

    it('returns empty array for null or undefined input', () => {
        expect(parseStoredBooks(null)).toEqual([]);
        // @ts-ignore: testing runtime robustness
        expect(parseStoredBooks(undefined)).toEqual([]);
    });

    it('parses valid books with all optional fields', () => {
        const json = JSON.stringify([
            {
                id: 'abc123',
                title: 'The Art of Programming',
                authors: ['Donald Knuth'],
                publisher: 'Addison-Wesley',
                publishedDate: '1997-07-04',
                description: 'A comprehensive guide to algorithms.',
                isbn: '978-0201896831',
                pageCount: 672,
                thumbnailUrl: 'https://example.com/thumb.jpg',
                infoLink: 'https://books.google.com/abc123',
                confidence: 85,
            },
        ]);

        const result = parseStoredBooks(json);

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
            id: 'abc123',
            title: 'The Art of Programming',
            authors: ['Donald Knuth'],
            publisher: 'Addison-Wesley',
            publishedDate: '1997-07-04',
            description: 'A comprehensive guide to algorithms.',
            isbn: '978-0201896831',
            pageCount: 672,
            thumbnailUrl: 'https://example.com/thumb.jpg',
            infoLink: 'https://books.google.com/abc123',
            confidence: 85,
        });
    });

    it('filters out invalid entries but keeps valid ones in mixed arrays', () => {
        const json = JSON.stringify([
            // Valid entry
            { id: 'valid-id', title: 'Real Book' },
            // Invalid: missing title
            { id: 'no-title' },
            // Invalid: empty string title
            { id: 'empty', title: '   ' },
            // Invalid: non-string id
            { id: 123, title: 'Number Id' },
            // Valid entry with trimmed whitespace
            { id: 'trimmed-id ', title: ' Trimmed Title ' },
        ]);

        const result = parseStoredBooks(json);

        const books = result as Array<{id: string; title: string}>;
        expect(result).toHaveLength(2);
        expect(books.map((b) => b.id)).toEqual(['valid-id', 'trimmed-id']);
        expect(result[1].title).toBe('Trimmed Title');
    });

    it('returns empty array for non-array JSON strings', () => {
        expect(parseStoredBooks('{}')).toEqual([]);
        expect(parseStoredBooks('"just a string"')).toEqual([]);
        expect(parseStoredBooks('42')).toEqual([]);
        expect(parseStoredBooks('[1, 2, "three"]')).toEqual([]);
    });

    it('returns empty array for corrupted JSON', () => {
        const result = parseStoredBooks('{invalid json [[[');
        expect(result).toEqual([]);
    });

    it('clamps confidence to [0, 100] for out-of-range values', () => {
        const json = JSON.stringify([
            { id: 'high-conf', title: 'High Confidence', confidence: 250 },
            { id: 'low-conf', title: 'Low Confidence', confidence: -30 },
            { id: 'float-conf', title: 'Float Confidence', confidence: 7.8 },
            { id: 'negative-zero', title: 'Negative Zero', confidence: -0.1 },
        ]);

        const result = parseStoredBooks(json);

        expect(result).toHaveLength(4);
        expect(result[0].confidence).toBe(100);
        expect(result[1].confidence).toBe(0);
        expect(result[2].confidence).toBe(8);
        expect(result[3].confidence).toBe(0);
    });

    it('keeps books with empty author arrays but returns them still', () => {
        const json = JSON.stringify([
            { id: 'all-whitespace-authors', title: 'Trimmed Authors', authors: ['  ', '', null, undefined] },
            { id: 'mixed-authors', title: 'Mixed Authors', authors: ['  ', 'Real Author'] },
        ]);

        const result = parseStoredBooks(json);

        expect(result).toHaveLength(2);
        // all-whitespace-authors still kept (has valid id+title), but authors array is empty after trim
        expect(result[0].authors).toEqual([]);
        expect(result[1].id).toBe('mixed-authors');
    });

    it('trims whitespace from optional metadata fields', () => {
        const json = JSON.stringify([
            {
                id: 'whitespace-meta',
                title: 'Whitespace Book',
                description: '  A story about spaces.  ',
                publisher: '  Press Co  ',
                thumbnailUrl: 'https://example.com/thumb.jpg  ',
                infoLink: 'https://books.google.com/x  ',
            },
        ]);

        const result = parseStoredBooks(json);

        expect(result).toHaveLength(1);
        expect(result[0].description).toBe('A story about spaces.');
        expect(result[0].publisher).toBe('Press Co');
        expect(result[0].thumbnailUrl).toBe('https://example.com/thumb.jpg');
        expect(result[0].infoLink).toBe('https://books.google.com/x');
    });

    it('rejects non-string id/title values and filters null entries', () => {
        const json = JSON.stringify([
            // Boolean id — not a string, should be rejected
            { id: true, title: 'Bool ID' },
            // Number id — not a string, should be rejected
            { id: 42, title: 'Number Id' },
            // null entry in array — silently skipped
            null,
            undefined,
            // Valid entry survives alongside noise
            { id: 'real-id', title: 'Real Book' },
        ]);

        const result = parseStoredBooks(json);

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('real-id');
    });

    it('converts non-string optional fields to null', () => {
        const json = JSON.stringify([
            {
                id: 'bool-fields',
                title: 'Bool Fields Book',
                publisher: true,
                isbn: 12345,
                description: false,
            },
        ]);

        const result = parseStoredBooks(json);

        expect(result).toHaveLength(1);
        // getTrimmedString returns null for non-string inputs
        expect(result[0].publisher).toBe(null);
        expect(result[0].isbn).toBe(null);
        expect(result[0].description).toBe(null);
    });

    it('handles NaN and out-of-range confidence values', () => {
        const json = JSON.stringify([
            { id: 'nan-conf', title: 'NaN Confidence', confidence: NaN },
            { id: 'infinity-conf', title: 'Infinity Confidence', confidence: Infinity },
            { id: 'negative-pages', title: 'Negative Pages', pageCount: -5 },
        ]);

        const result = parseStoredBooks(json);

        expect(result).toHaveLength(3);
        // NaN is not finite, so getStoredConfidence returns null → defaults to 0
        expect(result[0].confidence).toBe(0);
        // Infinity is not finite either
        expect(result[1].confidence).toBe(0);
        // pageCount must be a positive integer; -5 fails
        expect(result[2].pageCount).toBe(null);
    });

    it('filters mixed primitive and invalid-item arrays', () => {
        const json = JSON.stringify([
            42,           // number primitive — not an object, rejected
            'hello',      // string primitive — not an object, rejected
            null,         // null — rejected by !value check
            true,         // boolean primitive — rejected by typeof !== 'object'
            { id: 'valid-one', title: 'Valid' },
        ]);

        const result = parseStoredBooks(json);

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('valid-one');
    });

    it('trims whitespace and rejects non-string publishedDate values', () => {
        const json = JSON.stringify([
            { id: 'date-trimmed', title: 'Trimmed Date', publishedDate: '  2023-01-15  ' },
            { id: 'date-null', title: 'Null Date', publishedDate: null },
            { id: 'date-number', title: 'Number Date', publishedDate: 2023 },
        ]);

        const result = parseStoredBooks(json);

        expect(result).toHaveLength(3);
        expect(result[0].publishedDate).toBe('2023-01-15');
        expect(result[1].publishedDate).toBe(null);
        expect(result[2].publishedDate).toBe(null);
    });

    it('handles pageCount edge cases beyond negative values', () => {
        const json = JSON.stringify([
            { id: 'zero-pages', title: 'Zero Pages', pageCount: 0 },
            { id: 'float-pages', title: 'Float Pages', pageCount: 3.7 },
            { id: 'null-pages', title: 'Null Pages', pageCount: null },
            { id: 'string-pages', title: 'String Pages', pageCount: '100' },
            { id: 'valid-pages', title: 'Valid Pages', pageCount: 350 },
        ]);

        const result = parseStoredBooks(json);

        expect(result).toHaveLength(5);
        // zero fails the > 0 check → null
        expect(result[0].pageCount).toBe(null);
        // float fails Number.isInteger → null
        expect(result[1].pageCount).toBe(null);
        // null fails typeof === 'number' → null
        expect(result[2].pageCount).toBe(null);
        // string fails typeof === 'number' → null
        expect(result[3].pageCount).toBe(null);
        // valid positive integer passes
        expect(result[4].pageCount).toBe(350);
    });

    it('converts empty-string and whitespace-only optional metadata to null', () => {
        const json = JSON.stringify([
            {
                id: 'empty-fields',
                title: 'Empty Fields Book',
                description: '',
                publisher: '   ',
                isbn: '\t\n',
                thumbnailUrl: '',
                infoLink: '  ',
                publishedDate: '',
            },
        ]);

        const result = parseStoredBooks(json);

        expect(result).toHaveLength(1);
        // All empty/whitespace-only strings → null via getTrimmedString
        expect(result[0].description).toBe(null);
        expect(result[0].publisher).toBe(null);
        expect(result[0].isbn).toBe(null);
        expect(result[0].thumbnailUrl).toBe(null);
        expect(result[0].infoLink).toBe(null);
        expect(result[0].publishedDate).toBe(null);
    });

    it('preserves duplicate-ID books as separate entries', () => {
        const json = JSON.stringify([
            { id: 'dup-id', title: 'First Book' },
            { id: 'dup-id', title: 'Second Book' },
            // Duplicate ID — both should survive since normalizeStoredBook doesn't dedup by id
        ]);

        const result = parseStoredBooks(json);

        expect(result).toHaveLength(2);
        expect(result[0].id).toBe('dup-id');
        expect(result[0].title).toBe('First Book');
        expect(result[1].id).toBe('dup-id');
        expect(result[1].title).toBe('Second Book');
    });

    it('handles books with mixed valid and duplicate IDs', () => {
        const json = JSON.stringify([
            { id: 'unique-1', title: 'Unique First' },
            { id: 'dup-id', title: 'Duplicate A' },
            { id: 'unique-2', title: 'Unique Second' },
            { id: 'dup-id', title: 'Duplicate B' },
        ]);

        const result = parseStoredBooks(json);

        expect(result).toHaveLength(4);
        // All entries preserved in order — no deduplication by ID occurs
        const titles = (result as any[]).map((b) => b.title);
        expect(titles).toEqual(['Unique First', 'Duplicate A', 'Unique Second', 'Duplicate B']);
    });
});
