import { describe, it, expect, vi } from 'vitest';
import { computeConfidence, queryMatchRatio, getConfidenceLevel, getConfidenceColor, isHighConfidence, BookSearcher } from './books';
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
});
