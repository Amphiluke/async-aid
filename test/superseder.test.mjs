import assert from 'node:assert';
import {test, describe} from 'node:test';
import {createSuperseder} from '../dist/async-aid.mjs';

describe('Superseder', () => {
  test('Ordinal execution without superseding', async () => {
    const asyncFn = (n) => Promise.resolve(n);
    const superseder = createSuperseder(asyncFn);
    assert.strictEqual(await superseder(0), 0);
    assert.strictEqual(await superseder(1), 1);
  });

  test('Sequential superseding with resolving', async () => {
    const asyncFn = (n) => n % 2 ? Promise.resolve(n) : Promise.reject(n);
    const superseder = createSuperseder(asyncFn);
    const results = await Promise.all([superseder(1), superseder(2), superseder(3)]);
    assert.deepStrictEqual(results, [3, 3, 3]);
  });

  test('Sequential superseding with rejecting', async () => {
    const asyncFn = (n) => n % 2 ? Promise.resolve(n) : Promise.reject(n);
    const superseder = createSuperseder(asyncFn);
    const results = await Promise.allSettled([superseder(2), superseder(3), superseder(4)]);
    assert.strictEqual(results.length, 3);
    assert.ok(results.every(({status, reason}) => status === 'rejected' && reason === 4));
  });

  test('Key-based differentiation of independent superseders', async () => {
    const asyncFn = (n) => Promise.resolve(n);
    const superseder = createSuperseder(asyncFn, {keyFn: (number) => number % 3});
    const results = await Promise.all(Array.from({length: 10}, (_, index) => superseder(index)));
    assert.deepStrictEqual(results, [9, 7, 8, 9, 7, 8, 9, 7, 8, 9]);
  });
});
