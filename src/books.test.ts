import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BookSearcher, computeConfidence } from './books';
import type { Book } from './books';

// Mock toast to prevent import side effects
vi.mock('./state', () => ({
    toast: vi.fn(),
}));

function mockFetchResponse(data: object, status = 200) {
    return vi.fn().mockResolvedValue({
        ok: status >= 200 && status < 300,
        status,
        json: () => Promise.resolve(data),
    });
}

function googleBooksResponse(items: object[]) {
    return { items };
}

function volume(id: string, title: string, authors: string[] = [], isbn?: string) {
    return {
        id,
        volumeInfo: {
            title,
            authors,
            publisher: 'Test Publisher',
            publishedDate: '2024',
            description: 'A book',
            pageCount: 200,
            industryIdentifiers: isbn ? [{ type: 'ISBN_13', identifier: isbn }] : [],
            imageLinks: { thumbnail: 'https://books.google.com/thumb.jpg' },
            infoLink: `https://books.google.com/books?id=${id}`,
        },
    };
}

describe('BookSearcher', () => {
    let searcher: BookSearcher;

    beforeEach(() => {
        searcher = new BookSearcher();
        vi.stubGlobal('fetch', mockFetchResponse(googleBooksResponse([])));
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('search', () => {
        it('returns books from API response with confidence', async () => {
            vi.stubGlobal('fetch', mockFetchResponse(
                googleBooksResponse([volume('v1', 'Test Book', ['Alice'], '9781234567890')]),
            ));

            const results = await searcher.search('test book');
            expect(results).toHaveLength(1);
            expect(results[0].id).toBe('v1');
            expect(results[0].title).toBe('Test Book');
            expect(results[0].authors).toEqual(['Alice']);
            expect(results[0].isbn).toBe('9781234567890');
            expect(results[0].confidence).toBeGreaterThan(0);
            expect(results[0].confidence).toBeLessThanOrEqual(100);
        });

        it('skips queries shorter than 4 characters', async () => {
            const results = await searcher.search('ab');
            expect(results).toEqual([]);
            expect(fetch).not.toHaveBeenCalled();
        });

        it('skips duplicate queries (case-insensitive)', async () => {
            vi.stubGlobal('fetch', mockFetchResponse(googleBooksResponse([volume('v1', 'Book')])));

            await searcher.search('Hello World');
            await searcher.search('hello world');

            expect(fetch).toHaveBeenCalledTimes(1);
        });

        it('deduplicates books by ID across multiple searches', async () => {
            vi.stubGlobal('fetch', mockFetchResponse(
                googleBooksResponse([volume('v1', 'Same Book')]),
            ));

            const first = await searcher.search('query one');
            expect(first).toHaveLength(1);

            vi.stubGlobal('fetch', mockFetchResponse(
                googleBooksResponse([volume('v1', 'Same Book')]),
            ));

            const second = await searcher.search('query two');
            expect(second).toHaveLength(0);
        });

        it('handles 429 rate limit response', async () => {
            vi.useFakeTimers();
            vi.stubGlobal('fetch', mockFetchResponse({}, 429));

            const promise = searcher.search('rate limited');
            await vi.advanceTimersByTimeAsync(5000);
            const results = await promise;

            expect(results).toEqual([]);
            vi.useRealTimers();
        });

        it('handles non-ok response', async () => {
            vi.stubGlobal('fetch', mockFetchResponse({}, 500));
            const results = await searcher.search('server error');
            expect(results).toEqual([]);
        });

        it('handles fetch error', async () => {
            vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
            const results = await searcher.search('network fail');
            expect(results).toEqual([]);
        });

        it('handles response with no items', async () => {
            vi.stubGlobal('fetch', mockFetchResponse({}));
            const results = await searcher.search('empty query');
            expect(results).toEqual([]);
        });

        it('evicts oldest cache entry when full', async () => {
            vi.stubGlobal('fetch', mockFetchResponse(googleBooksResponse([])));

            // Fill cache to 200 entries
            for (let i = 0; i < 200; i++) {
                await searcher.search(`query number ${i} padded`);
            }

            // 201st should still work (evicts first)
            await searcher.search('brand new query here');
            expect(fetch).toHaveBeenCalledTimes(201);
        });

        it('parses book with missing optional fields', async () => {
            vi.stubGlobal('fetch', mockFetchResponse(googleBooksResponse([
                { id: 'v-minimal', volumeInfo: {} },
            ])));

            const results = await searcher.search('minimal book');
            expect(results).toHaveLength(1);
            expect(results[0].title).toBe('Unknown Title');
            expect(results[0].authors).toEqual([]);
            expect(results[0].isbn).toBeNull();
            expect(results[0].thumbnailUrl).toBeNull();
            expect(results[0].confidence).toBe(0);
        });

        it('includes ratings in confidence when available', async () => {
            vi.stubGlobal('fetch', mockFetchResponse(googleBooksResponse([
                {
                    id: 'v-rated',
                    volumeInfo: {
                        title: 'Rated Book',
                        authors: ['Author'],
                        publisher: 'Pub',
                        publishedDate: '2024',
                        description: 'Desc',
                        pageCount: 100,
                        industryIdentifiers: [{ type: 'ISBN_13', identifier: '9780000000000' }],
                        imageLinks: { thumbnail: 'https://example.com/thumb.jpg' },
                        averageRating: 4.5,
                        ratingsCount: 50,
                    },
                },
            ])));

            const results = await searcher.search('rated book');
            expect(results).toHaveLength(1);
            // Full metadata (75) + rating contribution
            expect(results[0].confidence).toBeGreaterThan(75);
        });

        it('upgrades http thumbnail to https', async () => {
            vi.stubGlobal('fetch', mockFetchResponse(googleBooksResponse([
                {
                    id: 'v-http',
                    volumeInfo: {
                        title: 'HTTP Book',
                        imageLinks: { thumbnail: 'http://books.google.com/thumb.jpg' },
                    },
                },
            ])));

            const results = await searcher.search('http thumbnail');
            expect(results[0].thumbnailUrl).toBe('https://books.google.com/thumb.jpg');
        });
    });

    describe('preloadBookId', () => {
        it('prevents book from appearing in search results', async () => {
            searcher.preloadBookId('v1');

            vi.stubGlobal('fetch', mockFetchResponse(
                googleBooksResponse([volume('v1', 'Preloaded Book')]),
            ));

            const results = await searcher.search('preloaded book');
            expect(results).toHaveLength(0);
        });
    });

    describe('removeBookId', () => {
        it('allows book to appear in search results again', async () => {
            searcher.preloadBookId('v1');
            searcher.removeBookId('v1');

            vi.stubGlobal('fetch', mockFetchResponse(
                googleBooksResponse([volume('v1', 'Re-found Book')]),
            ));

            const results = await searcher.search('re-found book');
            expect(results).toHaveLength(1);
        });
    });

    describe('clear', () => {
        it('clears both query cache and book ID set', async () => {
            vi.stubGlobal('fetch', mockFetchResponse(
                googleBooksResponse([volume('v1', 'Book')]),
            ));

            await searcher.search('initial query');
            searcher.clear();

            // Same query should work again after clear
            vi.stubGlobal('fetch', mockFetchResponse(
                googleBooksResponse([volume('v1', 'Book')]),
            ));

            const results = await searcher.search('initial query');
            expect(results).toHaveLength(1);
        });
    });
});

describe('computeConfidence', () => {
    function makeBookData(overrides: Partial<Omit<Book, 'confidence'>> = {}): Omit<Book, 'confidence'> {
        return {
            id: 'b1',
            title: 'Test Book',
            authors: ['Author'],
            publisher: 'Publisher',
            publishedDate: '2024',
            description: 'A book',
            isbn: '9781234567890',
            pageCount: 200,
            thumbnailUrl: 'https://example.com/thumb.jpg',
            infoLink: 'https://example.com',
            ...overrides,
        };
    }

    it('returns max metadata score for complete book', () => {
        const score = computeConfidence(makeBookData());
        expect(score).toBe(75);
    });

    it('returns 0 for empty book', () => {
        const score = computeConfidence(makeBookData({
            title: 'Unknown Title',
            authors: [],
            publisher: null,
            publishedDate: null,
            description: null,
            isbn: null,
            pageCount: null,
            thumbnailUrl: null,
        }));
        expect(score).toBe(0);
    });

    it('adds rating points for averageRating', () => {
        const withoutRating = computeConfidence(makeBookData());
        const withRating = computeConfidence(makeBookData(), 4.0);
        expect(withRating).toBeGreaterThan(withoutRating);
    });

    it('adds rating points for ratingsCount', () => {
        const withoutCount = computeConfidence(makeBookData());
        const withCount = computeConfidence(makeBookData(), undefined, 50);
        expect(withCount).toBeGreaterThan(withoutCount);
    });

    it('caps at 100', () => {
        const score = computeConfidence(makeBookData(), 5.0, 200);
        expect(score).toBe(100);
    });

    it('scores partial metadata correctly', () => {
        // Only title + authors = 10 + 15 = 25
        const score = computeConfidence(makeBookData({
            publisher: null,
            publishedDate: null,
            description: null,
            isbn: null,
            pageCount: null,
            thumbnailUrl: null,
        }));
        expect(score).toBe(25);
    });
});
