import { describe, it, expect } from 'vitest';
import { computeConfidence, queryMatchRatio, getConfidenceLevel, getConfidenceColor, isHighConfidence } from './books';

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
});
