import { describe, it, expect } from 'vitest';
import { computeConfidence, queryMatchRatio, getConfidenceLevel } from './books';
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

        it('handles unicode normalization (NFC vs NFD)', () => {
            const book = { id: '1', title: 'Café', authors: [], publisher: null, publishedDate: null, description: null, isbn: null, pageCount: null, thumbnailUrl: null, infoLink: null, confidence: 0 } as Book;
            const queryNFC = 'Café';
            const queryNFD = 'Cafe\u0301';
            expect(queryMatchRatio(book, queryNFC)).toBe(1);
            expect(queryMatchRatio(book, queryNFD)).toBe(1);
        });

        it('handles duplicate words in query', () => {
            const book = { id: '1', title: 'The Great Gatsby', authors: ['F. Scott Fitzgerald'], publisher: null, publishedDate: null, description: null, isbn: null, pageCount: null, thumbnailUrl: null, infoLink: null, confidence: 0 } as Book;
            expect(queryMatchRatio(book, 'Great Great')).toBe(1);
        });

        it('handles multiple spaces in query', () => {
            const book = { id: '1', title: 'The Great Gatsby', authors: ['F. Scott Fitzgerald'], publisher: null, publishedDate: null, description: null, isbn: null, pageCount: null, thumbnailUrl: null, infoLink: null, confidence: 0 } as Book;
            expect(queryMatchRatio(book, 'The   Great  Gatsby')).toBe(1);
        });

        it('handles numbers in query', () => {
            const book = { id: '1', title: 'The Great Gatsby 1925', authors: ['F. Scott Fitzgerald'], publisher: null, publishedDate: null, description: null, isbn: null, pageCount: null, thumbnailUrl: null, infoLink: null, confidence: 0 } as Book;
            expect(queryMatchRatio(book, 'Gatsby 1925')).toBe(1);
        });

        it('caps contribution from ratingsCount at 8 even if ratingsCount > 100', () => {
            const book = { id: '1', title: 'The Great Gatsby', authors: ['F. Scott Fitzgerald'], publisher: 'Scribner', publishedDate: '1925', description: 'A classic', isbn: '9780743276540', pageCount: 180, thumbnailUrl: 'http://img.jpg', infoLink: 'http://link.com', confidence: 0 } as Book;
            // Metadata: 50
            // Query match: 30
            // Rating (5): 12
            // Count (200): 8
            // Total: 50 + 30 + 12 + 8 = 100
            expect(computeConfidence(book, 5, 200, 'The Great Gatsby')).toBe(100);
        });

        it('handles hyphenated words by treating them as separate words', () => {
            const book = { id: '1', title: 'Full-time job', authors: [], publisher: null, publishedDate: null, description: null, isbn: null, pageCount: null, thumbnailUrl: null, infoLink: null, confidence: 0 } as Book;
            expect(queryMatchRatio(book, 'full time')).toBe(1);
        });

        it('handles unicode normalization (accents)', () => {
            const book = { id: '1', title: 'Cafe', authors: [], publisher: null, publishedDate: null, description: null, isbn: null, pageCount: null, thumbnailUrl: null, infoLink: null, confidence: 0 } as Book;
            expect(queryMatchRatio(book, 'Café')).toBe(1);
        });

        it('does not match substrings (only whole words)', () => {
            const book = { id: '1', title: 'The Great Gatsby', authors: ['F. Scott Fitzgerald'], publisher: null, publishedDate: null, description: null, isbn: null, pageCount: null, thumbnailUrl: null, infoLink: null, confidence: 0 } as Book;
            expect(queryMatchRatio(book, 'Gats')).toBe(0);
        });

        it('handles multiple authors', () => {
            const book = { id: '1', title: 'Title', authors: ['Author One', 'Author Two'], publisher: null, publishedDate: null, description: null, isbn: null, pageCount: null, thumbnailUrl: null, infoLink: null, confidence: 0 } as Book;
            expect(queryMatchRatio(book, 'Author Two')).toBe(1);
        });

        it('matches query against author names', () => {
            const book = { id: '1', title: 'The Great Gatsby', authors: ['F. Scott Fitzgerald'], publisher: null, publishedDate: null, description: null, isbn: null, pageCount: null, thumbnailUrl: null, infoLink: null, confidence: 0 } as Book;
            expect(queryMatchRatio(book, 'Scott')).toBe(1);
        });

        it('returns 0 for empty query', () => {
            const book = { id: '1', title: 'The Great Gatsby', authors: ['F. Scott Fitzgerald'], publisher: null, publishedDate: null, description: null, isbn: null, pageCount: null, thumbnailUrl: null, infoLink: null, confidence: 0 } as Book;
            expect(queryMatchRatio(book, '')).toBe(0);
        });

        it('returns 0 for query with only whitespace', () => {
            const book = { id: '1', title: 'The Great Gatsby', authors: ['F. Scott Fitzgerald'], publisher: null, publishedDate: null, description: null, isbn: null, pageCount: null, thumbnailUrl: null, infoLink: null, confidence: 0 } as Book;
            expect(queryMatchRatio(book, '   ')).toBe(0);
        });

        it('returns 0 for query with only punctuation', () => {
            const book = { id: '1', title: 'The Great Gatsby', authors: ['F. Scott Fitzgerald'], publisher: null, publishedDate: null, description: null, isbn: null, pageCount: null, thumbnailUrl: null, infoLink: null, confidence: 0 } as Book;
            expect(queryMatchRatio(book, '!!! ???')).toBe(0);
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

        it('handles max ratings correctly', () => {
            expect(computeConfidence(baseBook, 5, 100, 'The Great Gatsby')).toBe(100);
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

        it('handles max ratings correctly', () => {
            expect(computeConfidence(baseBook, 5, 100, 'The Great Gatsby')).toBe(100);
        });

        it('calculates correct confidence with partial match and full ratings', () => {
            // Metadata: 50
            // Query match: 0.5 * 30 = 15
            // Rating: 5/5 * 12 = 12
            // Count: 100/100 * 8 = 8
            // Total: 50 + 15 + 12 + 8 = 85
            expect(computeConfidence(baseBook, 5, 100, 'Great Unknown')).toBe(85);
        });

        it('does not award points for "Unknown Title"', () => {
            const book = { ...baseBook, title: 'Unknown Title', authors: [], publisher: null, publishedDate: null, description: null, isbn: null, pageCount: null, thumbnailUrl: null, confidence: 0 } as Book;
            // Metadata: 0 + 0 (title) + 0 (authors) + 0 (isbn) + 0 (thumb) + 0 (desc) + 0 (pub) + 0 (date) = 0
            // Query: 'The Great Gatsby' -> 0 (no match with 'Unknown Title')
            // Rating: 5/5 * 12 = 12
            // Count: 100/100 * 8 = 8
            // Total: 12 + 8 = 20
            expect(computeConfidence(book, 5, 100, 'The Great Gatsby')).toBe(20);
        });

        it('handles averageRating of 0 correctly', () => {
            const book = { ...baseBook, title: 'The Great Gatsby', authors: ['F. Scott Fitzgerald'], publisher: 'Scribner', publishedDate: '1925', description: 'A classic', isbn: '9780743276540', pageCount: 180, thumbnailUrl: 'http://img.jpg', infoLink: 'http://link.com', confidence: 0 } as Book;
            // Metadata: 50
            // Query: 'The Great Gatsby' -> 30
            // Rating: 0 -> 0
            // Count: 100/100 * 8 = 8
            // Total: 50 + 30 + 0 + 8 = 88
            expect(computeConfidence(book, 0, 100, 'The Great Gatsby')).toBe(88);
        });
        it('handles undefined query correctly', () => {
            const fullBook = { ...baseBook, title: 'The Great Gatsby', authors: ['F. Scott Fitzgerald'], publisher: 'Scribner', publishedDate: '1925', description: 'A classic', isbn: '9780743276540', pageCount: 180, thumbnailUrl: 'http://img.jpg', infoLink: 'http://link.com', confidence: 0 } as Book;
            // Metadata: 50
            // Query: undefined -> 0
            // Rating: 5 -> 12
            // Count: 100 -> 8
            // Total: 50 + 12 + 8 = 70
            expect(computeConfidence(fullBook, 5, 100, undefined)).toBe(70);
        });

        it('handles "Unknown Title" as a zero-point title even if other metadata is present', () => {
            const book = { ...baseBook, title: 'Unknown Title', authors: ['Author'], publisher: 'Publisher', publishedDate: '2024', description: 'Desc', isbn: '123', pageCount: 100, thumbnailUrl: 'url', infoLink: 'link', confidence: 0 } as Book;
            // Metadata: title (0) + authors (10) + isbn (10) + thumbnail (5) + desc (5) + pub (5) + date (5) = 40
            // Query: 'Author' -> 10 (assuming authors match)
            // Rating: 5 -> 12
            // Count: 100 -> 8
            // Total: 40 + 10 + 12 + 8 = 70. Wait, Query match: 10 (if authors match).
            // Actually, queryMatchRatio(book, 'Author') where book.authors = ['Author'].
            // queryWords = ['author']. bookWords = {'the', 'great', 'gatsby', 'author', ...}.
            // match = 1. ratio = 1. score += 30.
            // Metadata: 40.
            // Rating: 12.
            // Count: 8.
            // Total: 40 + 30 + 12 + 8 = 90.
            expect(computeConfidence(book, 5, 100, 'Author')).toBe(90);
        });

        it('returns correct confidence levels', () => {
            expect(getConfidenceLevel(100)).toBe('High');
            expect(getConfidenceLevel(80)).toBe('High');
            expect(getConfidenceLevel(40)).toBe('Medium');
            expect(getConfidenceLevel(10)).toBe('Low');
            expect(getConfidenceLevel(0)).toBe('None');
        });
    });
});
