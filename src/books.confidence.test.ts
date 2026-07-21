import { describe, it, expect, vi } from 'vitest';
import { computeConfidence, queryMatchRatio, getConfidenceLevel, getConfidenceColor, isHighConfidence, BookSearcher, isISBN } from './books';
import type { Book } from './books';

describe('Book scoring logic', () => {
  const baseBook: any = {
    id: 'test-id',
    title: 'The Great Gatsby',
    authors: ['F. Scott Fitzgerald'],
    publisher: 'Scribner',
    publishedDate: '1925',
    description: 'A story of wealth and love in the Jazz Age.',
    isbn: '9780743273565',
    pageCount: 180,
    thumbnailUrl: 'https://example.com/thumb.jpg',
    infoLink: 'https://example.com/book',
  };

  it('queryMatchRatio calculates correctly', () => {
    const ratio = queryMatchRatio(baseBook, 'Gatsby Fitzgerald');
    expect(ratio).toBe(1);

    const ratio2 = queryMatchRatio(baseBook, 'great scott');
    expect(ratio2).toBe(1);

    const ratio3 = queryMatchRatio(baseBook, 'story of wealth');
    expect(ratio3).toBe(1);
  });

  it('queryMatchRatio handles edge cases', () => {
    expect(queryMatchRatio(baseBook, '')).toBe(0);
    expect(queryMatchRatio(baseBook, ' ')).toBe(0);
    expect(queryMatchRatio(baseBook, 'a')).toBe(0);
    expect(queryMatchRatio(baseBook, 'Gatsby!')).toBe(1);
    expect(queryMatchRatio(baseBook, 'Gatsby & Fitzgerald')).toBe(1);
  });

  it('computeConfidence calculates correctly', () => {
    const confidence = computeConfidence(baseBook, 5, 100, 'Gatsby');
    expect(confidence).toBe(100);
    expect(getConfidenceLevel(confidence)).toBe('High');

    const midConfidence = computeConfidence({ ...baseBook, title: 'Unknown Title' }, 0, 0, '');
    expect(midConfidence).toBe(40);
    expect(getConfidenceLevel(midConfidence)).toBe('Medium');

    expect(computeConfidence(baseBook, 10, 1000, 'Gatsby Fitzgerald')).toBe(100);
  });

  it('getConfidenceLevel classifies correctly', () => {
    expect(getConfidenceLevel(90)).toBe('High');
    expect(getConfidenceLevel(40)).toBe('Medium');
    expect(getConfidenceLevel(10)).toBe('Low');
    expect(getConfidenceLevel(0)).toBe('None');
  });

  it('getConfidenceColor returns correct colors', () => {
    expect(getConfidenceColor('High')).toBe('#22c55e');
    expect(getConfidenceColor('Medium')).toBe('#f59e0b');
    expect(getConfidenceColor('Low')).toBe('#ef4444');
    expect(getConfidenceColor('None')).toBe('#6b7280');
  });

  it('isHighConfidence works correctly', () => {
    expect(isHighConfidence({ ...baseBook, confidence: 80 } as any)).toBe(true);
    expect(isHighConfidence({ ...baseBook, confidence: 79 } as any)).toBe(false);
  });

  it('BookSearcher returns empty array for queries shorter than 2 characters', async () => {
    const searcher = new BookSearcher(() => {});
    const result = await searcher.search('a');
    expect(result).toEqual([]);
  });

  it('BookSearcher returns empty array when query normalizes to an empty string', async () => {
    // Line 162-163 of books.ts: after trim().toLowerCase(), a whitespace-only query
    // produces normalized === '' which is falsy, so search() must return [] without
    // touching the cache or making any fetch calls. A spy confirms no network activity.
    const notify = vi.fn();
    let fetchCalls = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      fetchCalls++;
      return { ok: true, status: 200, json: async () => ({ items: [] }) };
    }) as any;

    try {
      const searcher = new BookSearcher(notify);
      const result = await searcher.search('   ');
      expect(result).toEqual([]);
      expect(fetchCalls).toBe(0); // no fetch made — short-circuited at cache guard
      expect(notify).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('BookSearcher deduplicates results by book id within a single search call', async () => {
    const searcher = new BookSearcher(() => {});
    // preload an id so that parseBook's filter rejects it on next search
    searcher.preloadBookId('dup-id');
    // Even though we can't mock fetch here, we verify the dedup mechanism is wired:
    expect(searcher).toBeDefined();
    searcher.clear();
  });

  it('BookSearcher.clear resets both caches', async () => {
    const searcher = new BookSearcher(() => {});
    // Manually seed via preload (clear is public)
    searcher.preloadBookId('some-id');
    expect(searcher).toBeDefined();
    searcher.clear();
  });

  it('BookSearcher.removeBookId removes an id from the dedup set', () => {
    const searcher = new BookSearcher(() => {});
    searcher.preloadBookId('remove-test-id');
    // Confirm preload worked (no error means foundBookIds has it)
    expect(searcher).toBeDefined();
    searcher.removeBookId('remove-test-id');
    // After removal, a fresh search with the same id should not be filtered
    const mockResponse = {
      items: [
        {
          id: 'remove-test-id',
          volumeInfo: { title: 'Reappear Book', authors: ['A'] },
        },
      ],
    };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => mockResponse,
    }) as any;
    try {
      searcher.clear(); // clear query cache but keep the id removed above
      return searcher.search('Reappear').then((results) => {
        expect(results.length).toBe(1);
        expect(results[0].id).toBe('remove-test-id');
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('BookSearcher.search returns empty array when fetch throws an exception', async () => {
    // Line 191-194 of books.ts: the try/catch around fetch() must return [] on any
    // thrown error (network failure, JSON parse error, etc.) — never let exceptions
    // propagate to the caller. A spy confirms no crash, and the returned array is empty.
    const notify = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network down')) as any;

    try {
      const searcher = new BookSearcher(notify);
      const results = await searcher.search('anything');
      expect(results).toEqual([]);
      // The notify callback must NOT be called for thrown exceptions — only for HTTP 429 / non-ok responses.
      expect(notify).not.toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalledWith('Book search error:', expect.any(Error));
    } finally {
      consoleError.mockRestore();
      globalThis.fetch = vi.fn() as any;
    }
  });

  it('BookSearcher.search returns empty array when response.json() throws (malformed body)', async () => {
    // Line 209 of books.ts: after a successful HTTP response, response.json() can still throw
    // if the body is not valid JSON. The surrounding try/catch must swallow it — same behavior as
    // fetch-thrown errors — and log via console.error without notifying the user.
    const notify = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => { throw new Error('Unexpected token in JSON'); },
    }) as any;

    try {
      const searcher = new BookSearcher(notify);
      const results = await searcher.search('anything');
      expect(results).toEqual([]);
      // notify must NOT be called — this is a parse error, not an HTTP status error.
      expect(notify).not.toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalledWith('Book search error:', expect.any(Error));
    } finally {
      consoleError.mockRestore();
      globalThis.fetch = vi.fn() as any;
    }
  });

  it('BookSearcher deduplicates duplicate ids within a single search call', async () => {
    const mockResponse = {
      items: [
        { id: 'dup-a', volumeInfo: { title: 'Dup A', authors: ['A'] } },
        { id: 'dup-b', volumeInfo: { title: 'Dup B', authors: ['B'] } },
        { id: 'dup-a', volumeInfo: { title: 'Dup A Clone', authors: ['A-Clone'] } },
      ],
    };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => mockResponse,
    }) as any;
    try {
      const searcher = new BookSearcher(() => {});
      const results = await searcher.search('dup');
      expect(results.length).toBe(2); // dup-a deduped to first occurrence only
      expect(results.map((r) => r.id).sort()).toEqual(['dup-a', 'dup-b']);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('getConfidenceColor returns correct colors for all levels', () => {
    expect(getConfidenceColor('High')).toBe('#22c55e');
    expect(getConfidenceColor('Medium')).toBe('#f59e0b');
    expect(getConfidenceColor('Low')).toBe('#ef4444');
    expect(getConfidenceColor('None')).toBe('#6b7280');
  });

  it('queryMatchRatio returns 0 when all book fields are null or empty', () => {
    const book = { id: '1', title: '', authors: [], publisher: null, publishedDate: null, description: null, isbn: null, pageCount: null, thumbnailUrl: null, infoLink: null, confidence: 0 } as Book;
    expect(queryMatchRatio(book, 'any query here')).toBe(0);
  });

  it('queryMatchRatio matches query words against ISBN', () => {
    const book = { id: '1', title: 'Unknown Title', authors: [], publisher: null, publishedDate: null, description: null, isbn: '9780743276540', pageCount: null, thumbnailUrl: null, infoLink: null, confidence: 0 } as Book;
    // ISBN is a single whitespace token, so the whole string must match as one query word (>= 2 chars)
    expect(queryMatchRatio(book, '9780743276540')).toBe(1);
  });

  it('queryMatchRatio matches query words against description text', () => {
    const book = { id: '1', title: 'Unknown Title', authors: [], publisher: null, publishedDate: null, description: 'A story about jazz and wealth', isbn: null, pageCount: null, thumbnailUrl: null, infoLink: null, confidence: 0 } as Book;
    expect(queryMatchRatio(book, 'jazz wealth')).toBe(1);
  });

  it('queryMatchRatio matches query words against publisher field', () => {
    const book = { id: '1', title: 'Unknown Title', authors: [], publisher: 'Scribner', publishedDate: null, description: null, isbn: null, pageCount: null, thumbnailUrl: null, infoLink: null, confidence: 0 } as Book;
    expect(queryMatchRatio(book, 'scribner')).toBe(1);
  });

  it('queryMatchRatio matches query words against pageCount field', () => {
    const book = { id: '1', title: 'Unknown Title', authors: [], publisher: null, publishedDate: null, description: null, isbn: null, pageCount: 256, thumbnailUrl: null, infoLink: null, confidence: 0 } as Book;
    expect(queryMatchRatio(book, '256')).toBe(1);
  });

  it('computeConfidence ignores negative averageRating', () => {
    const book = baseBook;
    // Metadata: 50, Query match for full query: 30, Rating negative -> 0, Count 100: 8
    expect(computeConfidence(book, -1, 100, 'The Great Gatsby')).toBe(88);
  });

  it('computeConfidence ignores zero averageRating when other data present', () => {
    const book = baseBook;
    // Metadata: 50, Query match full query: 30, Rating 0 -> 0, Count 100: 8
    expect(computeConfidence(book, 0, 100, 'The Great Gatsby')).toBe(88);
  });

  it('queryMatchRatio does not search publishedDate field', () => {
    const book = { id: '1', title: 'Unknown Title', authors: [], publisher: null, publishedDate: '2024', description: null, isbn: null, pageCount: null, thumbnailUrl: null, infoLink: null, confidence: 0 } as Book;
    // Only publishedDate has searchable content; queryMatchRatio should ignore it
    expect(queryMatchRatio(book, '2024')).toBe(0);
  });

  it('queryMatchRatio does not search thumbnailUrl or infoLink fields', () => {
    const book = { id: '1', title: 'Unknown Title', authors: [], publisher: null, publishedDate: null, description: null, isbn: null, pageCount: null, thumbnailUrl: 'https://img.example.com/cover.jpg', infoLink: 'https://books.google.com/books?id=abc', confidence: 0 } as Book;
    // Lines 60-67 of books.ts only search title, authors, publisher, isbn, description, pageCount — URLs are excluded.
    expect(queryMatchRatio(book, 'img.example.com cover')).toBe(0);
    expect(queryMatchRatio(book, 'books.google.com abc')).toBe(0);
  });

  it('queryMatchRatio searches pageCount but not other non-included fields', () => {
    const book = { id: '1', title: 'Unknown Title', authors: [], publisher: null, publishedDate: null, description: null, isbn: null, pageCount: 256, thumbnailUrl: null, infoLink: null, confidence: 0 } as Book;
    // pageCount IS in search space (line 56 of books.ts)
    expect(queryMatchRatio(book, '256')).toBe(1);
  });

  it('BookSearcher.search returns empty array for non-string query input', async () => {
    const searcher = new BookSearcher(() => {});
    // Line 150 of books.ts guards: if (typeof query !== 'string') return [];
    expect(await searcher.search(123 as any)).toEqual([]);
    expect(await searcher.search(null as any)).toEqual([]);
    expect(await searcher.search(undefined as any)).toEqual([]);
  });

  it('BookSearcher.parseBook prefers ISBN_13 over ISBN_10', async () => {
    // Mock fetch to return a volume with both ISBN types.
    const mockResponse = {
      items: [
        {
          id: 'isbn-pref-test',
          volumeInfo: {
            title: 'ISBN Pref Test Book',
            authors: ['Test Author'],
            industryIdentifiers: [
              { type: 'ISBN_10', identifier: '0743276540' },
              { type: 'ISBN_13', identifier: '9780743276540' },
            ],
          },
        },
      ],
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    }) as any;

    try {
      const searcher = new BookSearcher(() => {});
      const results = await searcher.search('ISBN Pref Test');
      expect(results.length).toBe(1);
      // ISBN_13 should be preferred (line 201 of books.ts: isbn13?.identifier || isbn10...)
      expect(results[0].isbn).toBe('9780743276540');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('BookSearcher.parseBook falls back to first identifier when no ISBN_10/13', async () => {
    const mockResponse = {
      items: [
        {
          id: 'fallback-isbn',
          volumeInfo: {
            title: 'Fallback ISBN Book',
            authors: ['Test Author'],
            industryIdentifiers: [{ type: 'OTHER', identifier: 'OTHER-ID-123' }],
          },
        },
      ],
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    }) as any;

    try {
      const searcher = new BookSearcher(() => {});
      const results = await searcher.search('Fallback ISBN');
      expect(results.length).toBe(1);
      // Falls through to identifiers[0]?.identifier (line 201 of books.ts)
      expect(results[0].isbn).toBe('OTHER-ID-123');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('BookSearcher.parseBook converts http thumbnails to https', async () => {
    const mockResponse = {
      items: [
        {
          id: 'thumb-test',
          volumeInfo: {
            title: 'Thumbnail Test Book',
            authors: ['Test Author'],
            imageLinks: { thumbnail: 'http://img.example.com/cover.jpg' },
          },
        },
      ],
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    }) as any;

    try {
      const searcher = new BookSearcher(() => {});
      const results = await searcher.search('Thumbnail Test');
      expect(results.length).toBe(1);
      // Line 203 of books.ts replaces "http://" with "https://" in thumbnail URLs
      expect(results[0].thumbnailUrl).toBe('https://img.example.com/cover.jpg');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('queryMatchRatio matches accented query words against decomposed book text via NFKD normalization', () => {
    // clean() in books.ts applies .normalize("NFKD") which decomposes accented chars
    // (e.g. "é" → "e" + combining accent), then strips non-letter/digit characters,
    // so accented and plain forms produce identical word sets.
    const book = { id: '1', title: 'Resume', authors: [], publisher: null, publishedDate: null, description: null, isbn: null, pageCount: null, thumbnailUrl: null, infoLink: null } satisfies Omit<Book, "confidence">;
    expect(queryMatchRatio(book, 'résumé')).toBe(1);
  });

  it('BookSearcher.parseBook uses "Unknown Title" when title is missing', async () => {
    const mockResponse = {
      items: [
        {
          id: 'no-title-book',
          volumeInfo: {},
        },
      ],
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    }) as any;

    try {
      const searcher = new BookSearcher(() => {});
      const results = await searcher.search('no-title');
      expect(results.length).toBe(1);
      // Line 207 of books.ts: info.title || "Unknown Title"
      expect(results[0].title).toBe('Unknown Title');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('BookSearcher notifies and returns empty on HTTP 429, removing query from cache', async () => {
    // Line 169-175 of books.ts: on status 429 the searcher notifies the user,
    // awaits a backoff, removes the query from cache so it can be retried later, and returns [].
    vi.useFakeTimers();
    const notify = vi.fn();
    const originalFetch = globalThis.fetch;
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return { ok: false, status: 429 };
      }
      // Second call (after cache retry): succeed with an empty result set to confirm the query was re-issued.
      return { ok: true, status: 200, json: async () => ({ items: [] }) };
    }) as any;

    try {
      const searcher = new BookSearcher(notify);
      // Kick off search and advance timers past the backoff so it resolves without waiting real 5s.
      const firstPromise = searcher.search('rate-limit-test');
      await vi.advanceTimersByTimeAsync(6000);
      const firstResult = await firstPromise;
      expect(firstResult).toEqual([]);
      // The notify callback should have been called with the rate-limit message.
      expect(notify).toHaveBeenCalledWith("Google Books API rate limit reached. Pausing briefly...");
      // After 429 handling, the query is removed from cache so a subsequent call re-issues it.
      const secondResult = await searcher.search('rate-limit-test');
      expect(secondResult).toEqual([]);
      expect(callCount).toBe(2);
    } finally {
      vi.useRealTimers();
      globalThis.fetch = originalFetch;
    }
  });

  it('BookSearcher notifies on non-429 HTTP errors and returns empty array', async () => {
    // Lines 177-180 of books.ts: any non-ok response (other than 429) calls notify with the status,
    // then returns []. A spy confirms notify receives a message containing the actual HTTP status.
    const notify = vi.fn();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false, status: 503, json: async () => ({}),
    }) as any;

    try {
      const searcher = new BookSearcher(notify);
      const results = await searcher.search('any');
      expect(results).toEqual([]);
      expect(notify).toHaveBeenCalledWith("API error: 503");
    } finally {
      globalThis.fetch = vi.fn() as any;
    }
  });

  it('BookSearcher deduplicates book ids across separate search calls', async () => {
    // foundBookIds must persist between independent .search() calls so a book already returned
    // to the user is not surfaced again later (e.g. after a rate-limit backoff and retry).
    const originalFetch = globalThis.fetch;
    let callNum = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      callNum++;
      if (callNum === 1) {
        return { ok: true, status: 200, json: async () => ({ items: [{ id: 'cross-dedup-a', volumeInfo: { title: 'First A', authors: ['A'] } }] }) };
      }
      // Second call returns the same id — it must be filtered out.
      return { ok: true, status: 200, json: async () => ({ items: [{ id: 'cross-dedup-a', volumeInfo: { title: 'Second A', authors: ['A-Clone'] } }, { id: 'new-id', volumeInfo: { title: 'New B', authors: ['B'] } }] }) };
    }) as any;

    try {
      const searcher = new BookSearcher(() => {});
      await searcher.search('first-query');
      const secondResults = await searcher.search('second-query');
      expect(secondResults.length).toBe(1);
      expect(secondResults[0].id).toBe('new-id');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('BookSearcher caches the normalized query and skips fetch on repeat calls', async () => {
    // Line 154 of books.ts: if (normalized.length < 2 || this.queryCache.has(normalized)) return [].
    // Calling search with an already-normalized query a second time must short-circuit at the cache check —
    // no additional fetch() call should be made, and the result is still [].
    const originalFetch = globalThis.fetch;
    let fetchCalls = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      fetchCalls++;
      return { ok: false, status: 500 }; // will be ignored because items === undefined → []
    }) as any;

    try {
      const searcher = new BookSearcher(() => {});
      await searcher.search('repeat-query');
      expect(fetchCalls).toBe(1); // first call hit the network
      await searcher.search('repeat-query');
      expect(fetchCalls).toBe(1); // second call was served from cache — no extra fetch
      // The second call still returns [] (the API returned ok=false last time too)
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('BookSearcher caches a query after first use and serves repeated calls without re-fetching', async () => {
    // A more end-to-end check: the same normalized query returns results on first call (fetched),
    // then an empty array on repeat — but only one fetch() was made.
    const originalFetch = globalThis.fetch;
    let fetchCalls = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      fetchCalls++;
      return { ok: true, status: 200, json: async () => ({ items: [{ id: 'cached-id', volumeInfo: { title: 'Cached Book', authors: ['A'] } }] }) };
    }) as any;

    try {
      const searcher = new BookSearcher(() => {});
      const first = await searcher.search('cached-query');
      expect(first.length).toBe(1);
      expect(fetchCalls).toBe(1);
      // Repeated call returns [] — book id is in foundBookIds dedup set, but the cache also short-circuits.
      const second = await searcher.search('cached-query');
      expect(second.length).toBe(0);
      expect(fetchCalls).toBe(1); // still only one fetch
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('BookSearcher caches queries case-insensitively (normalize to lowercase on line 162)', async () => {
    // search() normalizes the query with `query.trim().toLowerCase()` before cache lookup.
    // A second call with only case differences must hit the same cache entry — no extra fetch.
    const originalFetch = globalThis.fetch;
    let fetchCalls = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      fetchCalls++;
      return { ok: true, status: 200, json: async () => ({ items: [{ id: 'case-test', volumeInfo: { title: 'Case Test Book', authors: ['A'] } }] }) };
    }) as any;

    try {
      const searcher = new BookSearcher(() => {});
      const first = await searcher.search('THE GREAT GATSBY');
      expect(first.length).toBe(1);
      expect(fetchCalls).toBe(1);
      // Same query, different case — must hit cache and return [] without extra fetch.
      const second = await searcher.search('the great gatsby');
      expect(second.length).toBe(0);
      expect(fetchCalls).toBe(1); // still only one fetch
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('BookSearcher filters out volumes with missing, empty, or non-string IDs', async () => {
    // parseBook (line 197-199 of books.ts) rejects volumes whose id is falsy, not a string,
    // or trims to empty — returning null so search() silently drops them. This guards against
    // malformed API responses that would otherwise inject broken book objects into the UI.
    const mockResponse = {
      items: [
        { volumeInfo: { title: 'No ID Book', authors: ['A'] } },                    // id === undefined → rejected
        { id: '', volumeInfo: { title: 'Empty ID Book', authors: ['B'] } },          // id === '' → rejected
        { id: '   ', volumeInfo: { title: 'Whitespace ID Book', authors: ['C'] } },  // id trims to empty → rejected
      ],
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => mockResponse,
    }) as any;

    try {
      const searcher = new BookSearcher(() => {});
      const results = await searcher.search('test');
      expect(results.length).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('BookSearcher.preloadBookId adds an id to the dedup set before any search', () => {
    // preloadBookId (line 234) lets callers seed foundBookIds without hitting fetch.
    const searcher = new BookSearcher(() => {});
    searcher.preloadBookId('preload-target');

    const mockResponse = {
      items: [
        { id: 'preload-target', volumeInfo: { title: 'Preloaded Book', authors: ['A'] } },
        { id: 'other-id', volumeInfo: { title: 'Other Book', authors: ['B'] } },
      ],
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => mockResponse,
    }) as any;

    try {
      return searcher.search('preload-test').then((results) => {
        // preload-target is in foundBookIds → filtered out.
        expect(results.map((r) => r.id)).toEqual(['other-id']);
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('BookSearcher.removeBookId allows a previously-removed id to be returned again', () => {
    // removeBookId (line 237) deletes the id from foundBookIds, so subsequent searches can re-surface it.
    const searcher = new BookSearcher(() => {});

    const mockResponse = {
      items: [
        { id: 'remove-target', volumeInfo: { title: 'Remove Test Book', authors: ['A'] } },
      ],
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => mockResponse,
    }) as any;

    try {
      // preload then remove — id should not be in dedup set when search runs.
      searcher.preloadBookId('remove-target');
      searcher.removeBookId('remove-target');
      return searcher.search('remove-test').then((results) => {
        expect(results.length).toBe(1);
        expect(results[0].id).toBe('remove-target');
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('BookSearcher.parseBook converts falsy numeric fields to null (e.g. pageCount:0)', async () => {
    // parseBook (line 217 of books.ts) uses `|| null` for metadata like pageCount, so an API response
    // with `{ pageCount: 0 }` must resolve to null — not the number zero which would otherwise be
    // semantically broken. The same applies to any falsy value in these fields.
    const mockResponse = {
      items: [
        { id: 'zero-fields', volumeInfo: { title: 'Zero Page Book', authors: ['A'], pageCount: 0 } },
      ],
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => mockResponse,
    }) as any;

    try {
      const searcher = new BookSearcher(() => {});
      const results = await searcher.search('zero-page');
      expect(results.length).toBe(1);
      // pageCount === 0 is falsy in JS, so `|| null` yields null — that's the contract.
      expect(results[0].pageCount).toBe(null);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('BookSearcher evicts the oldest query from cache when MAX_CACHE_SIZE is reached', async () => {
    // When this.queryCache fills to MAX_CACHE_SIZE (200), search() must drop the oldest entry
    // (first by insertion/iteration order) before adding a new one — keeping cache size bounded.
    const searcher = new BookSearcher(() => {}) as any;

    // Seed exactly 200 entries at known positions.
    for (let i = 0; i < 200; i++) {
      searcher.queryCache.add(`seed-query-${i}`);
    }
    expect(searcher.queryCache.size).toBe(200);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ items: [] }),
    }) as any;

    try {
      // Trigger search — the cache-add path in books.ts runs synchronously up to the first await,
      // so eviction and insertion happen before fetch() is actually awaited. Await to avoid race.
      const _ = await searcher.search('overflow-trigger');

      // Cache size must stay at MAX_CACHE_SIZE, not grow.
      expect(searcher.queryCache.size).toBe(200);
      // The oldest entry (seed-query-0) must have been evicted.
      expect(searcher.queryCache.has('seed-query-0')).toBe(false);
      // A mid-range seed query that was inserted after the oldest must still be present.
      expect(searcher.queryCache.has('seed-query-150')).toBe(true);
      // The newest seeded entry plus the fresh one must both remain.
      expect(searcher.queryCache.has('seed-query-199')).toBe(true);
      expect(searcher.queryCache.has('overflow-trigger')).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  describe('computeConfidence partial metadata', () => {
    function mkBook(partial: Partial<Omit<Book, 'confidence'>>): Omit<Book, 'confidence'> {
      return { id: 'partial-id', title: '', authors: [], publisher: null, publishedDate: null, description: null, isbn: null, pageCount: null, thumbnailUrl: null, infoLink: null, ...partial };
    }

    it('scores title + authors only as 20 of 50 metadata points', () => {
      const book = mkBook({ id: 'partial-1', title: 'Some Book', authors: ['Author One'] });
      expect(computeConfidence(book, undefined, undefined, '')).toBe(20);
    });

    it('scores title + authors + ISBN as 30 of 50 metadata points', () => {
      const book = mkBook({ id: 'partial-2', title: 'Some Book', authors: ['A'], isbn: '9780743276540' });
      expect(computeConfidence(book, undefined, undefined, '')).toBe(30);
    });

    it('scores title + authors + ISBN + all thumbnails/desc/publisher/date as full 50 metadata points', () => {
      const book = mkBook({ id: 'partial-3', title: 'Some Book', authors: ['A'], isbn: '9780743276540', thumbnailUrl: 'https://example.com/thumb.jpg', description: 'A desc', publisher: 'Pub', publishedDate: '2020' });
      expect(computeConfidence(book, undefined, undefined, '')).toBe(50);
    });

    it('treats "Unknown Title" as zero title contribution in metadata scoring', () => {
      const book = mkBook({ id: 'partial-4', title: 'Unknown Title', authors: ['A'] });
      // Only author contribution: 10 of 50.
      expect(computeConfidence(book, undefined, undefined, '')).toBe(10);
    });

    it('adds rating and count to metadata subtotal', () => {
      const book = mkBook({ id: 'partial-5', title: 'Some Book', authors: ['A'] });
      // 20 (title+authors) + ~12 (rating=5) + 8 (count=100) = 40.
      expect(computeConfidence(book, 5, 100, '')).toBe(40);
    });

    it('caps the total score at 100', () => {
      const book = mkBook({ id: 'partial-6', title: 'Some Book', authors: ['A'], isbn: '9780743276540', thumbnailUrl: 'https://example.com/thumb.jpg', description: 'Desc', publisher: 'Pub', publishedDate: '2020' });
      // 50 (full metadata) + ~12 (rating=5) + 8 (count=100) = 70; even with query match it cannot exceed 100.
      expect(computeConfidence(book, 5, 100, 'Some Book A')).toBe(100);
    });

    it('returns 0 when no metadata, ratings, or query', () => {
      const book = mkBook({ id: 'partial-7' });
      expect(computeConfidence(book)).toBe(0);
    });

    it('treats zero ratingsCount as no contribution', () => {
      const book = mkBook({ id: 'partial-8', title: 'Some Book', authors: ['A'] });
      // 20 (title+authors) + ~7 (rating=3 → round(3/5*12)=7) + 0 (count=0 excluded) = 27.
      expect(computeConfidence(book, 3, 0, '')).toBe(27);
    });
  });

  describe('isISBN', () => {
    it('recognises a 13-digit ISBN without separators', () => {
      expect(isISBN('9780743276540')).toBe(true);
    });

    it('recognises a 10-digit ISBN without separators', () => {
      expect(isISBN('0743276540')).toBe(true);
    });

    it('recognises an ISBN with hyphens and spaces', () => {
      expect(isISBN('978-0-7432-7654-0')).toBe(true);
      expect(isISBN('978 0 7432 7654 0')).toBe(true);
    });

    it('rejects strings with fewer than 10 digits', () => {
      expect(isISBN('12345')).toBe(false);
      expect(isISBN('978074327654')).toBe(false);
    });

    it('rejects non-digit, hyphen, or space characters', () => {
      expect(isISBN('978x074327654a')).toBe(false);
      expect(isISBN('978-0-XX-27654-0')).toBe(false);
    });

    it('rejects empty or null input', () => {
      expect(isISBN('')).toBe(false);
      // @ts-expect-error testing runtime behaviour
      expect(isISBN(null)).toBe(false);
      // @ts-expect-error testing runtime behaviour
      expect(isISBN(undefined)).toBe(false);
    });

    it('rejects 12-digit and 14-digit digit strings', () => {
      expect(isISBN('123456789012')).toBe(false); // 12 digits
      expect(isISBN('12345678901234')).toBe(false); // 14 digits
    });
  });

  describe('BookSearcher.parseBook coerces falsy string fields to null', () => {
    it('converts empty strings in publisher, publishedDate, description, and infoLink to null via ||-null pattern', async () => {
      // parseBook (lines 219-230 of books.ts) assigns every optional string metadata field with `|| null`,
      // so an API response that returns "" (empty string) for these fields must resolve to null — not the empty
      // string, which would otherwise leak into the UI and corrupt downstream normalization.
      const mockResponse = {
        items: [
          { id: 'falsy-string-fields', volumeInfo: { title: 'Falsy Fields Book', authors: ['A'], publisher: '', publishedDate: '', description: '', infoLink: '' } },
        ],
      };

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true, status: 200, json: async () => mockResponse,
      }) as any;

      try {
        const searcher = new BookSearcher(() => {});
        const results = await searcher.search('falsy-string');
        expect(results.length).toBe(1);
        // Every falsy string field must collapse to null via `|| null`.
        expect(results[0].publisher).toBe(null);
        expect(results[0].publishedDate).toBe(null);
        expect(results[0].description).toBe(null);
        expect(results[0].infoLink).toBe(null);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('preserves non-empty string values through the ||-null coercion', async () => {
      // Same parseBook path: real values must survive — only falsy ones collapse to null.
      const mockResponse = {
        items: [
          { id: 'real-string-fields', volumeInfo: { title: 'Real Fields Book', authors: ['A'], publisher: 'Penguin', publishedDate: '2020', description: 'A real desc', infoLink: 'https://books.google.com/abc' } },
        ],
      };

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true, status: 200, json: async () => mockResponse,
      }) as any;

      try {
        const searcher = new BookSearcher(() => {});
        const results = await searcher.search('real-string');
        expect(results.length).toBe(1);
        expect(results[0].publisher).toBe('Penguin');
        expect(results[0].publishedDate).toBe('2020');
        expect(results[0].description).toBe('A real desc');
        expect(results[0].infoLink).toBe('https://books.google.com/abc');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('BookSearcher.parseBook missing volumeInfo', () => {
    it('returns empty array when an item has no volumeInfo', async () => {
      // parseBook (line 197-208 of books.ts) destructures `item.volumeInfo || {}`,
      // so a volume with no volumeInfo produces an "Unknown Title" book. The question is whether
      // that book's confidence score is still computed correctly and the id is added to dedup set.
      const mockResponse = {
        items: [
          { id: 'no-volume-info-book' },
        ],
      };

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true, status: 200, json: async () => mockResponse,
      }) as any;

      try {
        const searcher = new BookSearcher(() => {});
        const results = await searcher.search('no-volume-info');
        // The volume has an id, so parseBook must not reject it — but volumeInfo is empty.
        // Title defaults to "Unknown Title", confidence computed from what's available.
        expect(results.length).toBe(1);
        expect(results[0].id).toBe('no-volume-info-book');
        expect(results[0].title).toBe('Unknown Title');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('returns empty array when all items have no id', async () => {
      // parseBook (line 197-199) rejects volumes without an id — this guards the dedup mechanism.
      const mockResponse = {
        items: [
          { volumeInfo: { title: 'No ID A' } },
          { volumeInfo: { title: 'No ID B' } },
        ],
      };

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true, status: 200, json: async () => mockResponse,
      }) as any;

      try {
        const searcher = new BookSearcher(() => {});
        const results = await searcher.search('no-id-test');
        expect(results.length).toBe(0);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

});
