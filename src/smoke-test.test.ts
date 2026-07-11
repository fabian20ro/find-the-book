import { expect, test, beforeEach } from 'vitest';
import { getState, update, on, type Book } from './state';

beforeEach(() => {
  // reset state fields to defaults — module-level state persists across tests
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
