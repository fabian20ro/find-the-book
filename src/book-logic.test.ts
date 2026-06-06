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

        it('handles short query words (less than 3)', () => {
            const book = { id: '1', title: 'The Great Gatsby', authors: ['F. Scott. Fitzgerald'], publisher: null, publishedDate: null, description: null, isbn: null, pageCount: null, thumbnailUrl: null, infoLink: null, confidence: 0 } as Book;
            expect(queryMatchRatio(book, 'The Great F. Scott')).toBe(1);
        });
    });

    describe('computeConfidence', () => {
        const baseBook = { id: '1', title: 'The Great Gatsby', authors: ['F. Scott Fitzgerald'], publisher: 'Scribner', publishedDate: '1925', description: 'A classic', isbn: '9780743276540', pageCount: 180, thumbnailUrl: 'http://img.jpg', infoLink: 'http://link.com', confidence: 0 } as Book;

        it('returns 0 for minimal book', () => {
            const minimalBook = { ...baseBook, title: 'Unknown Title', authors: [], publisher: null, publishedDate: null, description: null, isbn: null, pageCount: null, thumbnailUrl: null, infoLink: null, confidence: 0 } as Book;
            expect(computeConfidence(minimalBook)).toBe(0);
        });

        it('calculates full confidence', () => {
            expect(computeConfidence(baseBook, 5, 100, 'The Great Gatsby')).toBe(100);
        });

        it('handles partial matches and ratings', () => {
            const partialBook = { ...baseBook, title: 'Gatsby', authors: ['Fitzgerald'], publisher: null, publishedDate: null, description: null, isbn: '123', pageCount: null, thumbnailUrl: 'http://img.jpg', infoLink: null, confidence: 0 } as Book;
            expect(computeConfidence(partialBook, 0, 0, 'Gatsby')).toBe(65);
        });
    });
});
