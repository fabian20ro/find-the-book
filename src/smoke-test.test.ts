import { expect, test, beforeEach } from 'vitest';
import { getState, update, on } from './state';

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
