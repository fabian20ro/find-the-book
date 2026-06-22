import { describe, it, expect } from 'vitest';
import { computeConfidence, queryMatchRatio } from './books';
import type { Book } from './books';

describe('Book logic', () => {
    describe('queryMatchRatio', () => {
        it('returns 1 for exact match', () => {
            const book = { id: '1', title: 'The Great Gatsby', authors: ['F. Scott Fitzgerald'], publisher: null, publishedDate: null, description: null, isbn: null, pageCount: null, thumbnailUrl: null, infoLink: null, confidence: 0 } as Book;
            expect(queryMatchRatio(book, 'The Great Gatsby')).toBe(1);
        });

        it('returns 0 for no match', () => {
            const book = { id: '1', title: 'The Great Gatsby', authors: ['F. Scott Fitzgerald'], publisher: null, publishedDate: null, description: null, isbn: null, pageCount: null, thumbnailUrl: null, infoLink: null, confidence: 0 } as Book;
            expect(queryMatchRatio(book, 'Moby Dick')).toBe(0);
        });

        it('handles short query words (less than 3) by filtering them out', () => {
            const book = { id: '1', title: 'The Great Gatsby', authors: ['F. Scott. Fitzgerald'], publisher: null, publishedDate: null, description: null, isbn: null, pageCount: null, thumbnailUrl: null, infoLink: null, confidence: 0 } as Book;
            expect(queryMatchRatio(book, 'The Great F. Scott')).toBe(1);
        });

        it('handles query with single-letter words by ignoring them', () => {
            const book = { id: '1', title: 'The Great Gatsby', authors: ['F. Scott Fitzgerald'], publisher: null, publishedDate: null, description: null, isbn: null, pageCount: null, thumbnailUrl: null, infoLink: null, confidence: 0 } as Book;
            expect(queryMatchRatio(book, 'A B C D')).toBe(0);
        });

        it('calculates correct ratio for partial word matches and mixed case', () => {
            const book = { id: '1', title: 'The Great Gatsby', authors: ['F. Scott Fitzgerald'], publisher: null, publishedDate: null, description: null, isbn: null, pageCount: null, thumbnailUrl: null, infoLink: null, confidence: 0 } as Book;
            // queryWords: ['great', 'gatsby', 'unknown']
            // matches: 'great', 'gatsby'
            // ratio: 2/3
            expect(queryMatchRatio(book, 'Great Gatsby Unknown')).toBe(2/3);
        });

        it('handles query with special characters by stripping them', () => {
            const book = { id: '1', title: 'The Great Gatsby', authors: ['F. Scott Fitzgerald'], publisher: null, publishedDate: null, description: null, isbn: null, pageCount: null, thumbnailUrl: null, infoLink: null, confidence: 0 } as Book;
            expect(queryMatchRatio(book, 'Great! Gatsby?')).toBe(1);
        });

        it('handles query with punctuation and non-ASCII characters', () => {
            const book = { id: '1', title: 'Café de Paris', authors: ['Jean-Luc'], publisher: null, publishedDate: null, description: null, isbn: null, pageCount: null, thumbnailUrl: null, infoLink: null, confidence: 0 } as Book;
            // queryWords: ['cafe', 'de', 'paris'] (after clean)
            // bookWords: {'cafe', 'de', 'paris', 'jean', 'luc'}
            // matches: 'cafe', 'de', 'paris'
            // ratio: 3/3 = 1
            expect(queryMatchRatio(book, 'Café de Paris')).toBe(1);
        });

        it('handles multiple spaces in query', () => {
            const book = { id: '1', title: 'The Great Gatsby', authors: ['F. Scott Fitzgerald'], publisher: null, publishedDate: null, description: null, isbn: null, pageCount: null, thumbnailUrl: null, infoLink: null, confidence: 0 } as Book;
            expect(queryMatchRatio(book, 'The   Great  Gatsby')).toBe(1);
        });

        it('handles hyphenated words by treating them as separate words', () => {
            const book = { id: '1', title: 'Full-time job', authors: [], publisher: null, publishedDate: null, description: null, isbn: null, pageCount: null, thumbnailUrl: null, infoLink: null, confidence: 0 } as Book;
            expect(queryMatchRatio(book, 'full time')).toBe(1);
        });
    });

    describe('computeConfidence', () => {
        const baseBook = { id: '1', title: 'The Great Gatsby', authors: ['F. Scott Fitzgerald'], publisher: 'Scribner', publishedDate: '1925', description: 'A classic', isbn: '9780743276540', pageCount: 180, thumbnailUrl: 'http://img.jpg', infoLink: 'http://link.com', confidence: 0 } as Book;

        it('returns 0 for minimal book', () => {
            const minimalBook = { ...baseBook, title: 'Unknown Title', authors: [], publisher: null, publishedDate: null, description: null, isbn: null, pageCount: null, thumbnailUrl: null, confidence: 0 } as Book;
            expect(computeConfidence(minimalBook)).toBe(0);
        });

        it('calculates full confidence', () => {
            expect(computeConfidence(baseBook, 5, 100, 'The Great Gatsby')).toBe(100);
        });

        it('handles partial matches and ratings', () => {
            const partialBook = { ...baseBook, title: 'Gatsby', authors: ['Fitzgerald'], publisher: null, publishedDate: null, description: null, isbn: '123', pageCount: null, thumbnailUrl: 'http://img.jpg', infoLink: null, confidence: 0 } as Book;
            expect(computeConfidence(partialBook, 0, 0, 'Gatsby')).toBe(65);
        });

        it('caps confidence at 100 even with very high ratings', () => {
            expect(computeConfidence(baseBook, 10, 200, 'The Great Gatsby')).toBe(100);
        });

        it('handles low ratings correctly', () => {
            const fullBook = { ...baseBook, title: 'The Great Gatsby', authors: ['F. Scott Fitzgerald'], publisher: 'Scribner', publishedDate: '1925', description: 'A classic', isbn: '9780743276540', pageCount: 180, thumbnailUrl: 'http://img.jpg', infoLink: 'http://link.com', confidence: 0 } as Book;
            // Metadata: 50
            // Query match: 30
            // Rating: round(0.5 * 12) = 6
            // Count: round(50/100 * 8) = 4
            // Total: 50 + 30 + 6 + 4 = 90
            expect(computeConfidence(fullBook, 2.5, 50, 'The Great Gatsby')).toBe(90);
        });

        it('handles undefined ratings correctly', () => {
            const book = { id: '1', title: 'The Great Gatsby', authors: ['F. Scott Fitzgerald'], publisher: 'Scribner', publishedDate: '1925', description: 'A classic', isbn: '9780743276540', pageCount: 180, thumbnailUrl: 'http://img.jpg', infoLink: 'http://link.com', confidence: 0 } as Book;
            // Metadata: 50
            // Query: 'The Great Gatsby' -> 30
            // Rating: undefined -> 0
            // Count: undefined -> 0
            // Total: 80
            expect(computeConfidence(book, undefined, undefined, 'The Great Gatsby')).toBe(80);
        });

        it('clamps averageRating contribution to 12 even if rating is > 5', () => {
            const book = { id: '1', title: 'The Great Gatsby', authors: ['F. Scott Fitzgerald'], publisher: 'Scribner', publishedDate: '1925', description: 'A classic', isbn: '9780743276540', pageCount: 180, thumbnailUrl: 'http://img.jpg', infoLink: 'http://link.com', confidence: 0 } as Book;
            // Metadata: 50
            // Query match: 0
            // Rating: round(10/5 * 12) = 24 (WITHOUT CLAMP)
            // Count: 0
            // Expected: 50 + 12 + 0 = 62.
            expect(computeConfidence(book, 10, 0, '')).toBe(62);
        });

    });
});
