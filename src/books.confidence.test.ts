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

    expect(computeConfidence({ ...baseBook, title: 'Unknown Title' }, 0, 0, '')).toBe(40);
    expect(computeConfidence(baseBook, 10, 1000, 'Gatsby Fitzgerald')).toBe(100);
  });
});
