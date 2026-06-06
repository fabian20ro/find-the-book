import { expect, test } from 'vitest';
import { getState } from './state';

test('initial state is correct', () => {
  const state = getState();
  expect(state.isScanning).toBe(false);
});
