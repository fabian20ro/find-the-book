import { describe, it, expect, beforeAll } from 'vitest';

describe('parsing stored books', () => {
    let parseStoredBooks: (s: string | null) => any;

    beforeAll(async () => {
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
});
