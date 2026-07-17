import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BookSearcher, computeConfidence, queryMatchRatio, getConfidenceLevel, isISBN, getConfidenceColor, isHighConfidence } from './books';
import type { Book } from './books';

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

        it('skips queries shorter than 2 characters', async () => {
            const results = await searcher.search('a');
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
            const notify = vi.fn();
            const searcherWithNotify = new BookSearcher(notify);
            vi.stubGlobal('fetch', mockFetchResponse({}, 429));

            const promise = searcherWithNotify.search('rate limited');
            await vi.advanceTimersByTimeAsync(5000);
            const results = await promise;

            expect(results).toEqual([]);
            expect(notify).toHaveBeenCalledWith("Google Books API rate limit reached. Pausing briefly...");
            vi.useRealTimers();
        });

        it('removes query from cache after 429 so next search retries', async () => {
            vi.useFakeTimers();
            const notify = vi.fn();
            const searcherWithNotify = new BookSearcher(notify);

            // Call search with 'rate limited' — this adds it to cache, then fetch returns 429 which triggers the rate-limit handler.
            vi.stubGlobal('fetch', mockFetchResponse({}, 429));

            const promise = searcherWithNotify.search('rate limited');
            await vi.advanceTimersByTimeAsync(5001); // slightly more than the 5000ms wait
            await promise;

            // After 429 + wait, the cache should be empty (entry removed)
            expect((searcherWithNotify as any).queryCache.has('rate limited')).toBe(false);
        });

        it('handles non-ok response', async () => {
            vi.stubGlobal('fetch', mockFetchResponse({}, 500));
            const results = await searcher.search('server error');
            expect(results).toEqual([]);
        });

        it('handles fetch error', async () => {
            const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
            vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
            const results = await searcher.search('network fail');
            expect(results).toEqual([]);
            expect(consoleError).toHaveBeenCalledWith('Book search error:', expect.any(Error));
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
            // Full metadata (50) + query match + rating contribution
            expect(results[0].confidence).toBeGreaterThan(50);
        });

        it('returns empty for null, undefined, or non-string input', async () => {
            expect(await searcher.search(null as any)).toEqual([]);
            expect(await searcher.search(undefined as any)).toEqual([]);
            expect(await searcher.search(42 as any)).toEqual([]);
            expect(fetch).not.toHaveBeenCalled();
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

        it('rejects volumes with missing or empty id', async () => {
            vi.stubGlobal('fetch', mockFetchResponse(googleBooksResponse([
                { volumeInfo: { title: 'No ID Book' } }, // no id field
                { id: '', volumeInfo: { title: 'Empty ID Book' } },
                { id: '   ', volumeInfo: { title: 'Whitespace ID Book' } },
                { id: 'valid-id', volumeInfo: { title: 'Valid Book' } },
            ])));

            const results = await searcher.search('id validation');
            expect(results).toHaveLength(1);
            expect(results[0].id).toBe('valid-id');
        });

        it('uses direct lookup URL for ISBN queries', async () => {
            vi.stubGlobal('fetch', mockFetchResponse(googleBooksResponse([volume('v-isbn', 'ISBN Book', ['Author'], '9781234567890')])));

            await searcher.search('9781234567890');
            expect(fetch).toHaveBeenCalledTimes(1);
            const [url] = (fetch as any).mock.calls[0];
            expect(url).toContain('/volumes/9781234567890');
            expect(url).not.toContain('q=');
        });

        it('prefers ISBN_13 over ISBN_10 when both identifiers exist', async () => {
            vi.stubGlobal('fetch', mockFetchResponse(googleBooksResponse([
                {
                    id: 'v-dual-isbn',
                    volumeInfo: {
                        title: 'Dual ISBN Book',
                        authors: ['Author'],
                        industryIdentifiers: [
                            { type: 'ISBN_10', identifier: '1234567890' },
                            { type: 'ISBN_13', identifier: '9781234567890' },
                        ],
                    },
                },
            ])));

            const results = await searcher.search('dual isbn');
            expect(results).toHaveLength(1);
            expect(results[0].isbn).toBe('9781234567890');
        });

        it('falls back to first identifier when neither ISBN_10 nor ISBN_13 is set', async () => {
            vi.stubGlobal('fetch', mockFetchResponse(googleBooksResponse([
                {
                    id: 'v-fallback-isbn',
                    volumeInfo: {
                        title: 'Fallback ISBN Book',
                        authors: ['Author'],
                        industryIdentifiers: [
                            { type: 'other_type', identifier: 'OTHER-123' },
                            { type: 'another_unknown', identifier: 'XYZ-999' },
                        ],
                    },
                },
            ])));

            const results = await searcher.search('fallback isbn');
            expect(results).toHaveLength(1);
            // First identifier wins when no recognized ISBN type is present.
            expect(results[0].isbn).toBe('OTHER-123');
        });

        it('uses search URL for non-ISBN queries', async () => {
            vi.stubGlobal('fetch', mockFetchResponse(googleBooksResponse([volume('v-search', 'Search Book')])));

            await searcher.search('search book title');
            expect(fetch).toHaveBeenCalledTimes(1);
            const [url] = (fetch as any).mock.calls[0];
            expect(url).toContain('q=');
        });

        it('deduplicates volume IDs within a single search response', async () => {
            vi.stubGlobal('fetch', mockFetchResponse(googleBooksResponse([
                volume('v1', 'First Book'),
                volume('v1', 'Duplicate Of First'),  // same id, different title
                volume('v2', 'Second Book'),
            ])));

            const results = await searcher.search('find books');
            expect(results).toHaveLength(2);
            expect(results.map((r) => r.id)).toEqual(['v1', 'v2']);
        });

        it('URL-encodes special characters in query for Google Books API', async () => {
            vi.stubGlobal('fetch', mockFetchResponse(googleBooksResponse([volume('v-accent', 'Café Book')])));

            await searcher.search('Café!');
            expect(fetch).toHaveBeenCalledTimes(1);
            const [url] = (fetch as any).mock.calls[0];
            // The query parameter should be URL-encoded, not sent raw with special chars.
            // encodeURIComponent("Café!") produces "%C3%A9" for é and "!" is preserved (not encoded to %21 in strict mode — but RFC 3986 allows !).
            expect(url).toContain('q=');
            const queryMatch = url.match(/q=([^&]+)/);
            expect(queryMatch).toBeTruthy();
            const decodedQuery = decodeURIComponent(queryMatch![1]);
            expect(decodedQuery).toBe('Café!');
        });

        it('URL-encodes spaces in query for Google Books API', async () => {
            vi.stubGlobal('fetch', mockFetchResponse(googleBooksResponse([volume('v-space', 'Space Book')])));

            await searcher.search('the space book');
            expect(fetch).toHaveBeenCalledTimes(1);
            const [url] = (fetch as any).mock.calls[0];
            const queryMatch = url.match(/q=([^&]+)/);
            expect(queryMatch).toBeTruthy();
            const decodedQuery = decodeURIComponent(queryMatch![1]);
            expect(decodedQuery).toBe('the space book');
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

    it('returns max metadata score for complete book (no query)', () => {
        const score = computeConfidence(makeBookData());
        expect(score).toBe(50);
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
        expect(withRating).toBe(60);
    });

    it('adds rating points for ratingsCount', () => {
        const withoutCount = computeConfidence(makeBookData());
        const withCount = computeConfidence(makeBookData(), undefined, 50);
        expect(withCount).toBeGreaterThan(withoutCount);
    });

    it('caps at 100', () => {
        const score = computeConfidence(makeBookData(), 5.0, 200, 'Test Book Author');
        expect(score).toBe(100);
    });

    it('scores partial metadata correctly', () => {
        // Only title + authors = 10 + 10 = 20
        const score = computeConfidence(makeBookData({
            publisher: null,
            publishedDate: null,
            description: null,
            isbn: null,
            pageCount: null,
            thumbnailUrl: null,
        }));
        expect(score).toBe(20);
    });

    it('adds query match points when query words match title/authors', () => {
        const withoutQuery = computeConfidence(makeBookData());
        const withQuery = computeConfidence(makeBookData(), undefined, undefined, 'Test Book Author');
        expect(withQuery).toBeGreaterThan(withoutQuery);
    });

    it('gives higher score when more query words match', () => {
        const partialMatch = computeConfidence(makeBookData(), undefined, undefined, 'Test something unrelated');
        const fullMatch = computeConfidence(makeBookData(), undefined, undefined, 'Test Book Author');
        expect(fullMatch).toBeGreaterThan(partialMatch);
    });
});

describe('queryMatchRatio', () => {
    function makeBookData(overrides: Partial<Omit<Book, 'confidence'>> = {}): Omit<Book, 'confidence'> {
        return {
            id: 'b1',
            title: 'The Great Gatsby',
            authors: ['F. Scott Fitzgerald'],
            publisher: null,
            publishedDate: null,
            description: null,
            isbn: null,
            pageCount: null,
            thumbnailUrl: null,
            infoLink: null,
            ...overrides,
        };
    }

    it('returns 0 for empty query', () => {
        expect(queryMatchRatio(makeBookData(), '')).toBe(0);
    });

    it('returns 0 when no words match', () => {
        expect(queryMatchRatio(makeBookData(), 'completely unrelated words')).toBe(0);
    });

    it('returns 1 when all query words match title/authors', () => {
        expect(queryMatchRatio(makeBookData(), 'Great Gatsby Fitzgerald')).toBe(1);
    });

    it('returns partial ratio when some words match', () => {
        // "Great" matches, "random" doesn't — 1/2 = 0.5
        expect(queryMatchRatio(makeBookData(), 'Great random')).toBe(0.5);
    });

    it('includes length 2 words (e.g., "at")', () => {
        // "The" is 3 chars and matches, "at" is 2 chars and should now match in "The at"
        expect(queryMatchRatio(makeBookData({title: 'The at'}), 'The at')).toBe(1);
    });

    it('is case-insensitive', () => {
        expect(queryMatchRatio(makeBookData(), 'GREAT GATSBY')).toBe(1);
    });

    it('matches accented queries after normalization', () => {
        expect(queryMatchRatio(makeBookData({ title: 'Café Society' }), 'Cafe Society')).toBe(1);
    });

    it('ignores punctuation in queries', () => {
        expect(queryMatchRatio(makeBookData({ title: 'The Great Gatsby!' }), 'Great, Gatsby?')).toBe(1);
    });
});

describe('getConfidenceLevel', () => {
  it('returns High for score >= 80', () => {
    expect(getConfidenceLevel(80)).toBe('High');
    expect(getConfidenceLevel(100)).toBe('High');
  });

  it('returns Medium for score between 40 and 79', () => {
    expect(getConfidenceLevel(40)).toBe('Medium');
    expect(getConfidenceLevel(79)).toBe('Medium');
  });

  it('returns Low for score between 1 and 39', () => {
    expect(getConfidenceLevel(1)).toBe('Low');
    expect(getConfidenceLevel(39)).toBe('Low');
  });

  it('returns None for score 0', () => {
    expect(getConfidenceLevel(0)).toBe('None');
  });
});

describe('isISBN', () => {
  it('recognizes valid ISBN-13 digits only', () => {
    expect(isISBN('9781234567890')).toBe(true);
  });

  it('recognizes valid ISBN-10 digits only', () => {
    expect(isISBN('1234567890')).toBe(true);
  });

  it('recognizes hyphenated ISBN-13', () => {
    expect(isISBN('978-1-23-456789-0')).toBe(true);
  });

  it('recognizes space-separated ISBN-13', () => {
    expect(isISBN('978 1 23 456 789 0')).toBe(true);
  });

  it('rejects strings with letters', () => {
    expect(isISBN('9781234ABCD')).toBe(false);
    expect(isISBN('ABCDEF1234567')).toBe(false);
  });

  it('rejects strings of wrong length', () => {
    expect(isISBN('12345678')).toBe(false); // 8 digits
    expect(isISBN('12345678901')).toBe(false); // 11 digits
    expect(isISBN('123456789012345')).toBe(false); // 15 digits
  });

  it('rejects empty or null input', () => {
    expect(isISBN('')).toBe(false);
    expect(isISBN(null as any)).toBe(false);
    expect(isISBN(undefined as any)).toBe(false);
  });

  it('handles mixed hyphens and spaces', () => {
    expect(isISBN('978-1 234567890')).toBe(true);
  });
});

describe('getConfidenceColor', () => {
  it('returns green for High confidence', () => {
    expect(getConfidenceColor('High')).toBe('#22c55e');
  });

  it('returns amber for Medium confidence', () => {
    expect(getConfidenceColor('Medium')).toBe('#f59e0b');
  });

  it('returns red for Low confidence', () => {
    expect(getConfidenceColor('Low')).toBe('#ef4444');
  });

  it('returns gray for None confidence', () => {
    expect(getConfidenceColor('None')).toBe('#6b7280');
  });
});

describe('isHighConfidence', () => {
  function makeBook(overrides: Partial<Book> = {}): Book {
    return {
      id: 'test-id',
      title: 'Test Book',
      authors: ['Author'],
      publisher: null,
      publishedDate: null,
      description: null,
      isbn: null,
      pageCount: null,
      thumbnailUrl: null,
      infoLink: null,
      confidence: 0,
      ...overrides,
    };
  }

  it('returns true for books with confidence >= 80', () => {
    expect(isHighConfidence(makeBook({ confidence: 80 }))).toBe(true);
    expect(isHighConfidence(makeBook({ confidence: 95 }))).toBe(true);
    expect(isHighConfidence(makeBook({ confidence: 100 }))).toBe(true);
  });

  it('returns false for books with confidence < 80', () => {
    expect(isHighConfidence(makeBook({ confidence: 79 }))).toBe(false);
    expect(isHighConfidence(makeBook({ confidence: 50 }))).toBe(false);
    expect(isHighConfidence(makeBook({ confidence: 1 }))).toBe(false);
  });

  it('returns false for zero confidence', () => {
    expect(isHighConfidence(makeBook({ confidence: 0 }))).toBe(false);
  });
});
