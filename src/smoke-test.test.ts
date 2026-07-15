import { expect, test, beforeEach } from 'vitest';
import { getState, update, on, toast, addBook, removeBook, clearBooks, setView, addCandidates, removeCandidateById, clearCandidates, moveBook, type Book } from './state';

beforeEach(() => {
  // reset state fields to defaults — module-level state persists across tests
  clearBooks();
  clearCandidates();
  update({
    isScanning: false,
    view: 'home',
    autoScan: false,
    scanCount: 0,
    lastDetectedText: '',
    error: null as any,
    candidateFilter: '' as any,
    isProcessingImage: false,
    ocrReady: false,
    ocrLanguage: 'ron',
    isChangingLanguage: false,
  });
});

test('initial state has expected defaults', () => {
  const state = getState();
  expect(state.isScanning).toBe(false);
  expect(state.view).toBe('home');
  expect(state.books).toEqual([]);
  expect(state.lastDetectedText).toBe('');
  expect(state.ocrReady).toBe(false);
});

test('update() applies changes and emits event', () => {
  let emitted = false;
  const off = on('change', () => { emitted = true; });

  update({ isScanning: true, view: 'scan' });

  expect(getState().isScanning).toBe(true);
  expect(getState().view).toBe('scan');
  expect(emitted).toBe(true);

  off();
});

test('update() does not emit when values are identical', () => {
  let emitted = false;
  const off = on('change', () => { emitted = true; });

  update({ isScanning: false, view: 'home' });

  expect(emitted).toBe(false);

  off();
});

test('update() preserves unmodified fields (shallow merge)', () => {
  const sampleBook = {
    id: 'x', title: 'existing-book', authors: [], publisher: null,
    publishedDate: null, description: null, isbn: null, pageCount: null,
    thumbnailUrl: null, infoLink: null, confidence: 0,
  };
  update({ books: [sampleBook], ocrLanguage: 'eng', autoScan: true });

  update({ isScanning: true, view: 'scan' });

  const state = getState();
  expect(state.isScanning).toBe(true);
  expect(state.view).toBe('scan');
  // unmodified fields must persist — confirms shallow merge behavior
  expect(state.books).toEqual([sampleBook]);
  expect(state.ocrLanguage).toBe('eng');
  expect(state.autoScan).toBe(true);
});

test('update() emits once when multiple fields change simultaneously', () => {
  let count = 0;
  const off = on('change', () => { count++; });

  update({ isScanning: true, view: 'scan', autoScan: false, scanCount: 5 });

  expect(count).toBe(1);
  expect(getState().isScanning).toBe(true);
  expect(getState().autoScan).toBe(false);
  expect(getState().scanCount).toBe(5);

  off();
});

test('update() notifies all subscribed listeners', () => {
  let firstFired = false;
  const off1 = on('change', () => { firstFired = true; });

  update({ isScanning: true, view: 'scan' });
  expect(firstFired).toBe(true);
});

test('toast event delivers message payload to listener', () => {
  let received: string | null = null;
  const off = on('toast', (msg) => { received = msg; });

  // toast() calls emit('toast', msg) synchronously — like update() for 'change'
  toast('Test message');

  expect(received).toBe('Test message');

  off();
});

test('addBook() normalizes, inserts, emits change, returns true', () => {
  let emitted = false;
  const off = on('change', () => { emitted = true; });

  const book: Book = {
    id: 'abc-123', title: '  hello world  ', authors: ['   author x  '],
    publisher: null, publishedDate: null, description: null, isbn: null,
    pageCount: null, thumbnailUrl: null, infoLink: null, confidence: 0,
  };

  const ok = addBook(book);

  expect(ok).toBe(true);
  expect(emitted).toBe(true);

  const state = getState();
  expect(state.books).toHaveLength(1);
  // normalization must have trimmed the values
  expect(state.books[0].id).toBe('abc-123');
  expect(state.books[0].title).toBe('hello world');
  expect(state.books[0].authors[0]).toBe('author x');

  off();
});

test('addBook() rejects duplicate id, does not emit', () => {
  let emitted = false;
  const off = on('change', () => { emitted = true; });

  const book: Book = {
    id: 'dup-x', title: 'first', authors: [], publisher: null,
    publishedDate: null, description: null, isbn: null, pageCount: null,
    thumbnailUrl: null, infoLink: null, confidence: 0,
  };

  expect(addBook(book)).toBe(true);
  expect(getState().books).toHaveLength(1);

  emitted = false;
  const sameBook: Book = { ...book, title: 'second' };
  expect(addBook(sameBook)).toBe(false);
  // state must be unchanged — no second entry
  expect(getState().books).toHaveLength(1);
  // no event should fire for the rejected insertion
  expect(emitted).toBe(false);

  off();
});

test('addBook() normalizes whitespace-only fields to null', () => {
  const book: Book = {
    id: 'edge-1', title: 'Edge Case', authors: ['Author'],
    publisher: '   ', publishedDate: '', description: '\t\n', isbn: '  ',
    pageCount: null, thumbnailUrl: null, infoLink: null, confidence: 0.5,
  };

  const ok = addBook(book);

  expect(ok).toBe(true);
  const state = getState();
  // whitespace-only strings must collapse to null per normalizeBook()
  expect(state.books[0].publisher).toBeNull();
  expect(state.books[0].publishedDate).toBeNull();
  expect(state.books[0].description).toBeNull();
  expect(state.books[0].isbn).toBeNull();
});

test('removeBook(index) deletes book, emits change, returns removed book', () => {
  const off = on('change', () => {});

  addBook({ id: 'del-a', title: 'A', authors: [], publisher: null, publishedDate: null, description: null, isbn: null, pageCount: null, thumbnailUrl: null, infoLink: null, confidence: 0 });
  addBook({ id: 'del-b', title: 'B', authors: [], publisher: null, publishedDate: null, description: null, isbn: null, pageCount: null, thumbnailUrl: null, infoLink: null, confidence: 0 });

  const removed = removeBook(1);
  expect(removed).not.toBeNull();
  expect(removed!.id).toBe('del-b');

  const state = getState();
  expect(state.books).toHaveLength(1);
  expect(state.books[0].id).toBe('del-a');

  off();
});

test('removeBook(0) removes the first book, shifts second into index 0', () => {
  const off = on('change', () => {});

  addBook({ id: 'first', title: 'First', authors: [], publisher: null, publishedDate: null, description: null, isbn: null, pageCount: null, thumbnailUrl: null, infoLink: null, confidence: 0 });
  addBook({ id: 'second', title: 'Second', authors: [], publisher: null, publishedDate: null, description: null, isbn: null, pageCount: null, thumbnailUrl: null, infoLink: null, confidence: 0 });

  const removed = removeBook(0);
  expect(removed).not.toBeNull();
  expect(removed!.id).toBe('first');

  const state = getState();
  expect(state.books).toHaveLength(1);
  expect(state.books[0].id).toBe('second');

  off();
});

test('clearBooks() empties the list and emits change', () => {
  let emitted = false;
  const off = on('change', () => { emitted = true; });

  addBook({ id: 'keep-me', title: 'Should vanish', authors: [], publisher: null, publishedDate: null, description: null, isbn: null, pageCount: null, thumbnailUrl: null, infoLink: null, confidence: 0 });

  clearBooks();

  const state = getState();
  expect(state.books).toHaveLength(0);
  expect(emitted).toBe(true);

  off();
});
