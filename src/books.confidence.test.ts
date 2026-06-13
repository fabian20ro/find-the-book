import { describe, it, expect } from 'vitest';
import { computeConfidence, queryMatchRatio } from './books';

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
    // queryWords: ['gatsby', 'fitzgerald']
    // bookText: 'the great gatsby f. scott fitzgerald'
    // matches: 'gatsby', 'fitzgerald' -> 2 matches
    // 2/2 = 1
    expect(ratio).toBe(1);

    const ratio2 = queryMatchRatio(baseBook, 'great scott');
    // queryWords: ['great', 'scott']
    // matches: 'great', 'scott' -> 2 matches
    // 2/2 = 1
    expect(ratio2).toBe(1);
  });

  it('computeConfidence calculates correctly', () => {
    // Base score without query:
    // title(10) + authors(10) + isbn(10) + thumb(5) + desc(5) + pub(5) + date(5) = 50
    // With query 'Gatsby' (1 match) -> 50 + (1/2 * 30) = 50 + 15 = 65
    // Ratings: avg(5) -> (5/5 * 12) = 12. count(100) -> (100/100 * 8) = 8.
    // Total: 50 (metadata) + 30 (query match) + 12 (ratings) + 8 (count) = 100
    const confidence = computeConfidence(baseBook, 5, 100, 'Gatsby');
    expect(confidence).toBe(100);

    // Test edge cases
    expect(computeConfidence({ ...baseBook, title: 'Unknown Title' }, 0, 0, '')).toBe(40);
  });
});
