import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getState, update, addBook, removeBook, moveBook, clearBooks, addCandidates, removeCandidateById, clearCandidates, toast, on, emit } from './state';

describe('update (edge cases)', () => {
    it('does not emit change when updating to the same value', () => {
        const listener = vi.fn();
        on('change', listener);
        update({ isScanning: false }); // already false by default
        expect(listener).not.toHaveBeenCalled();
    });

    it('handles empty patch without emitting', () => {
        const listener = vi.fn();
        on('change', listener);
        update({});
        expect(listener).not.toHaveBeenCalled();
    });

    it('returns current state with all fields after partial update', () => {
        update({ autoScan: true, scanCount: 5 });
        const s = getState();
        expect(s.autoScan).toBe(true);
        expect(s.scanCount).toBe(5);
        // Verify other fields preserved
        expect(s.books).toEqual([]);
        expect(s.isScanning).toBe(false);
        expect(s.view).toBe('home');
        expect(s.ocrLanguage).toBe('ron');
    });
});

import type { Book } from './books';

function makeBook(overrides: Partial<Book> = {}): Book {
    return {
        id: 'book-1',
        title: 'Test Book',
        authors: ['Author A'],
        publisher: 'Publisher',
        publishedDate: '2024',
        description: 'A test book',
        isbn: '1234567890',
        pageCount: 200,
        thumbnailUrl: 'https://example.com/thumb.jpg',
        infoLink: 'https://example.com/book',
        confidence: 75,
        ...overrides,
    };
}

describe('state', () => {
    beforeEach(() => {
        // Reset state to defaults
        update({
            books: [],
            candidateBooks: [],
            candidateFilter: '',
            isScanning: false,
            autoScan: false,
            scanCount: 0,
            lastDetectedText: '',
            error: null,
            view: 'home',
            isProcessingImage: false,
            ocrReady: false,
            ocrLanguage: 'ron',
            isChangingLanguage: false,
        });
    });

    describe('getState', () => {
        it('returns current state', () => {
            const state = getState();
            expect(state.books).toEqual([]);
            expect(state.isScanning).toBe(false);
            expect(state.autoScan).toBe(false);
            expect(state.view).toBe('home');
            expect(state.isProcessingImage).toBe(false);
            expect(state.ocrReady).toBe(false);
            expect(state.ocrLanguage).toBe('ron');
            expect(state.isChangingLanguage).toBe(false);
            expect(state.candidateFilter).toBe('');
        });
    });

    describe('update', () => {
        it('merges partial state', () => {
            update({ isScanning: true, scanCount: 5 });
            expect(getState().isScanning).toBe(true);
            expect(getState().scanCount).toBe(5);
        });

        it('emits change event', () => {
            const listener = vi.fn();
            on('change', listener);
            update({ scanCount: 1 });
            expect(listener).toHaveBeenCalledTimes(1);
        });

        it('updates view field', () => {
            update({ view: 'scan' });
            expect(getState().view).toBe('scan');
        });

        it('updates autoScan field', () => {
            update({ autoScan: false });
            expect(getState().autoScan).toBe(false);
        });

        it('updates isProcessingImage field', () => {
            update({ isProcessingImage: true });
            expect(getState().isProcessingImage).toBe(true);
        });

        it('updates ocrReady field', () => {
            update({ ocrReady: true });
            expect(getState().ocrReady).toBe(true);
        });

        it('updates ocrLanguage field', () => {
            update({ ocrLanguage: 'eng' });
            expect(getState().ocrLanguage).toBe('eng');
        });

        it('updates isChangingLanguage field', () => {
            update({ isChangingLanguage: true });
            expect(getState().isChangingLanguage).toBe(true);
        });

        it('updates candidateFilter field', () => {
            update({ candidateFilter: 'search term' });
            expect(getState().candidateFilter).toBe('search term');
        });
    });

    describe('addBook', () => {
        it('adds a book and returns true', () => {
            const book = makeBook();
            const result = addBook(book);
            expect(result).toBe(true);
            expect(getState().books).toHaveLength(1);
            expect(getState().books[0].title).toBe('Test Book');
        });

        it('rejects duplicate book by id', () => {
            addBook(makeBook({ id: 'dup' }));
            const result = addBook(makeBook({ id: 'dup', title: 'Different Title' }));
            expect(result).toBe(false);
            expect(getState().books).toHaveLength(1);
        });

        it('allows different books', () => {
            addBook(makeBook({ id: 'a' }));
            addBook(makeBook({ id: 'b' }));
            expect(getState().books).toHaveLength(2);
        });

        it('emits change event', () => {
            const listener = vi.fn();
            on('change', listener);
            addBook(makeBook());
            expect(listener).toHaveBeenCalled();
        });
    });

    describe('removeBook', () => {
        it('removes book at index and returns it', () => {
            addBook(makeBook({ id: 'a', title: 'First' }));
            addBook(makeBook({ id: 'b', title: 'Second' }));

            const removed = removeBook(0);
            expect(removed).not.toBeNull();
            expect(removed!.title).toBe('First');
            expect(getState().books).toHaveLength(1);
            expect(getState().books[0].title).toBe('Second');
        });

        it('returns null for invalid index', () => {
            expect(removeBook(-1)).toBeNull();
            expect(removeBook(0)).toBeNull();
            expect(removeBook(100)).toBeNull();
        });

        it('emits change event', () => {
            addBook(makeBook());
            const listener = vi.fn();
            on('change', listener);
            removeBook(0);
            expect(listener).toHaveBeenCalled();
        });
    });

    describe('clearBooks', () => {
        it('removes all books', () => {
            addBook(makeBook({ id: 'a' }));
            addBook(makeBook({ id: 'b' }));
            clearBooks();
            expect(getState().books).toEqual([]);
        });

        it('emits change event', () => {
            const listener = vi.fn();
            on('change', listener);
            addBook(makeBook());
            expect(listener).toHaveBeenCalled();
        });

        it('trims whitespace from id and title during addBook', () => {
            addBook(makeBook({ id: '  dup-1  ', title: '  Title 1  ' }));
            addBook(makeBook({ id: 'dup-2', title: 'Title 2' }));
            const books = getState().books;
            expect(books).toHaveLength(2);
            expect(books[0].id).toBe('dup-1');
            expect(books[0].title).toBe('Title 1');
        });

        it('rejects duplicate book by id even with whitespace', () => {
            addBook(makeBook({ id: 'dup' }));
            const result = addBook(makeBook({ id: '  dup  ', title: 'Different Title' }));
            expect(result).toBe(false);
            expect(getState().books).toHaveLength(1);
        });

        it('trims ISBN and optional metadata fields during addBook', () => {
            addBook(makeBook({
                isbn: '  978-0-123456-78-9  ',
                publisher: '  Publisher Co  ',
                publishedDate: '  2024  ',
                description: '  A great book  ',
            }));
            const [book] = getState().books;
            expect(book.isbn).toBe('978-0-123456-78-9');
            expect(book.publisher).toBe('Publisher Co');
            expect(book.publishedDate).toBe('2024');
            expect(book.description).toBe('A great book');
        });

        it('trims author names and drops whitespace-only authors during addBook', () => {
            addBook(makeBook({ authors: ['  Author A  ', '   ', 'Author B'] }));
            const [book] = getState().books;
            expect(book.authors).toEqual(['Author A', 'Author B']);
        });

        it('converts whitespace-only isbn to null during addBook', () => {
            addBook(makeBook({ isbn: '   ' }));
            const [book] = getState().books;
            expect(book.isbn).toBeNull();
        });
        
        it('deduplicates against existing candidates', () => {
            addCandidates([makeBook({ id: 'c1' })]);
            addCandidates([makeBook({ id: 'c1' }), makeBook({ id: 'c2' })]);
            expect(getState().candidateBooks).toHaveLength(2);
        });

        it('deduplicates against already-added books', () => {
            addBook(makeBook({ id: 'b1' }));
            addCandidates([makeBook({ id: 'b1' })]);
            expect(getState().candidateBooks).toHaveLength(0);
        });

        it('trims metadata fields during addCandidates', () => {
            addCandidates([makeBook({
                id: 'c-trim',
                isbn: '  978-0-123456-78-9  ',
                authors: ['  Author A  ', '   '],
                publisher: '  Pub Co  ',
            })]);
            const [candidate] = getState().candidateBooks;
            expect(candidate.isbn).toBe('978-0-123456-78-9');
            expect(candidate.authors).toEqual(['Author A']);
            expect(candidate.publisher).toBe('Pub Co');
        });

        it('emits change event when candidates added', () => {
            const listener = vi.fn();
            on('change', listener);
            addCandidates([makeBook({ id: 'c1' })]);
            expect(listener).toHaveBeenCalled();
        });

        it('does not emit change when all duplicates', () => {
            addCandidates([makeBook({ id: 'c1' })]);
            const listener = vi.fn();
            on('change', listener);
            addCandidates([makeBook({ id: 'c1' })]);
            expect(listener).not.toHaveBeenCalled();
        });
    });

    describe('removeCandidateById', () => {
        it('removes candidate by id', () => {
            addCandidates([makeBook({ id: 'c1' }), makeBook({ id: 'c2' })]);
            removeCandidateById('c1');
            expect(getState().candidateBooks).toHaveLength(1);
            expect(getState().candidateBooks[0].id).toBe('c2');
        });

        it('emits change event', () => {
            addCandidates([makeBook({ id: 'c1' })]);
            const listener = vi.fn();
            on('change', listener);
            removeCandidateById('c1');
            expect(listener).toHaveBeenCalled();
        });
    });

    describe('clearCandidates', () => {
        it('removes all candidates', () => {
            addCandidates([makeBook({ id: 'c1' }), makeBook({ id: 'c2' })]);
            clearCandidates();
            expect(getState().candidateBooks).toEqual([]);
        });

        it('resets candidateFilter', () => {
            update({ candidateFilter: 'some filter' });
            clearCandidates();
            expect(getState().candidateFilter).toBe('');
        });

        it('emits change event', () => {
            const listener = vi.fn();
            on('change', listener);
            clearCandidates();
            expect(listener).toHaveBeenCalled();
        });
    });

    describe('event system', () => {
        it('on() returns unsubscribe function', () => {
            const listener = vi.fn();
            const unsub = on('change', listener);
            update({ scanCount: 1 });
            expect(listener).toHaveBeenCalledTimes(1);

            unsub();
            update({ scanCount: 2 });
            expect(listener).toHaveBeenCalledTimes(1);
        });

        it('toast emits toast event with message', () => {
            const listener = vi.fn();
            on('toast', listener);
            toast('Hello!');
            expect(listener).toHaveBeenCalledWith('Hello!');
        });

        it('emit sends data to listeners', () => {
            const listener = vi.fn();
            on('toast', listener);
            emit('toast', 'test data');
            expect(listener).toHaveBeenCalledWith('test data');
        });

        it('multiple listeners receive events', () => {
            const a = vi.fn();
            const b = vi.fn();
            on('change', a);
            on('change', b);
            update({ scanCount: 1 });
            expect(a).toHaveBeenCalled();
            expect(b).toHaveBeenCalled();
        });
    });

    describe('moveBook', () => {
        it('moves a book from one position to another', () => {
            addBook(makeBook({ id: 'a', title: 'A' }));
            addBook(makeBook({ id: 'b', title: 'B' }));
            addBook(makeBook({ id: 'c', title: 'C' }));

            moveBook(0, 2);
            const titles = getState().books.map((b) => b.title);
            expect(titles).toEqual(['B', 'C', 'A']);
        });

        it('does nothing when from equals to', () => {
            addBook(makeBook({ id: 'a', title: 'A' }));
            addBook(makeBook({ id: 'b', title: 'B' }));

            const listener = vi.fn();
            on('change', listener);
            moveBook(0, 0);
            expect(listener).not.toHaveBeenCalled();
        });

        it('does nothing for out-of-bounds indices', () => {
            addBook(makeBook({ id: 'a', title: 'A' }));

            moveBook(-1, 0);
            moveBook(0, 5);
            expect(getState().books).toHaveLength(1);
        });

        it('emits change event', () => {
            addBook(makeBook({ id: 'a', title: 'A' }));
            addBook(makeBook({ id: 'b', title: 'B' }));

            const listener = vi.fn();
            on('change', listener);
            moveBook(0, 1);
            expect(listener).toHaveBeenCalled();
        });
    });
});
