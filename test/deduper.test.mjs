import assert from 'node:assert';
import {test, describe} from 'node:test';
import {createDeduper, resetDeduper} from '../dist/async-aid.mjs';

describe('Deduper', () => {
  test('Protecting a pending async function from repeated calls', (context) => {
    const asyncFn = context.mock.fn(() => Promise.resolve());
    const deduper = createDeduper(asyncFn);
    for (let i = 0; i < 5; i++) deduper();
    assert.strictEqual(asyncFn.mock.callCount(), 1);
  });

  test('Deduper returns the same promise while pending', async () => {
    const asyncFn = () => Promise.resolve(Symbol());
    const deduper = createDeduper(asyncFn);
    const [promise1, promise2, promise3] = [deduper(), deduper(), deduper()];
    assert.strictEqual(promise1, promise2);
    assert.strictEqual(promise1, promise3);
    const [result1, result2, result3] = await Promise.all([promise1, promise2, promise3]);
    assert.strictEqual(typeof result1, 'symbol');
    assert.strictEqual(result1, result2);
    assert.strictEqual(result1, result3);
  });

  test('Dedupe lock is removed when the currently pending promise settles', async () => {
    const asyncFn = (counter) => (counter % 2) ? Promise.resolve(counter) : Promise.reject(counter);
    const deduper = createDeduper(asyncFn);
    for (let i = 0; i < 5; i++) {
      assert.strictEqual(await deduper(i).catch((result) => result), i);
    }
  });

  test('Key-based differentiation of independently deduped processes', async (context) => {
    const asyncFn = context.mock.fn((number) => Promise.resolve(number));
    const deduper = createDeduper(asyncFn, {keyFn: (number) => number});
    const numbers = [0, 0, 1, 0, 1, 2, 2, 1, 0, 7, 2];
    const uniqueNumbers = Array.from(new Set(numbers));
    const promises = numbers.map((number) => deduper(number));
    assert.strictEqual(asyncFn.mock.callCount(), uniqueNumbers.length);
    uniqueNumbers.forEach((number, index) => assert.deepStrictEqual(asyncFn.mock.calls[index].arguments, [number]));
    assert.deepStrictEqual(await Promise.all(promises), numbers);
  });

  test('Manual lock removal', (context) => {
    const asyncFn = context.mock.fn(() => Promise.resolve());
    const deduper = createDeduper(asyncFn);
    assert.strictEqual(resetDeduper(deduper), false);
    deduper();
    deduper();
    assert.strictEqual(asyncFn.mock.callCount(), 1);
    assert.strictEqual(resetDeduper(deduper), true);
    deduper();
    assert.strictEqual(asyncFn.mock.callCount(), 2);
  });

  test('Selective key-based lock removal', (context) => {
    const asyncFn = context.mock.fn((a, b) => Promise.resolve(a + b));
    const deduper = createDeduper(asyncFn, {keyFn: (a, b) => `${typeof a}+${typeof b}`});
    deduper(0, 1);
    deduper(2, 3);
    deduper('00', '11');
    deduper('22', '33');
    assert.strictEqual(asyncFn.mock.callCount(), 2);
    assert.deepStrictEqual(asyncFn.mock.calls[0].arguments, [0, 1]);
    assert.deepStrictEqual(asyncFn.mock.calls[1].arguments, ['00', '11']);
    resetDeduper(deduper, 'string+string');
    deduper(4, 5);
    deduper('44', '55');
    deduper('66', '77');
    assert.strictEqual(asyncFn.mock.callCount(), 3);
    assert.deepStrictEqual(asyncFn.mock.calls[2].arguments, ['44', '55']);
  });

  test('All-keys lock removal', (context) => {
    const asyncFn = context.mock.fn((a, b) => Promise.resolve(a + b));
    const deduper = createDeduper(asyncFn, {keyFn: (a, b) => `${typeof a}+${typeof b}`});
    assert.strictEqual(resetDeduper(deduper), false);
    deduper(0, 1);
    deduper('00', '11');
    assert.strictEqual(asyncFn.mock.callCount(), 2);
    assert.strictEqual(resetDeduper(deduper), true);
    deduper(4, 5);
    deduper('44', '55');
    assert.strictEqual(asyncFn.mock.callCount(), 4);
  });

  test('Prevent clearing of superseding dedupe lock', async (context) => {
    const withResolvers = Promise.withResolvers ?
      () => Promise.withResolvers() :
      () => {
        const result = {};
        result.promise = new Promise((resolve, reject) => Object.assign(result, {resolve, reject}));
        return result;
      };
    const resolvers = [withResolvers(), withResolvers(), withResolvers()];
    const asyncFn = context.mock.fn((index) => resolvers[index].promise);
    const deduper = createDeduper(asyncFn);
    deduper(0); // set lock to the first promise
    deduper(0); // suppressed due to active lock
    resetDeduper(deduper); // remove lock
    deduper(1); // set lock to the second promise
    await resolvers[0].resolve(); // resolving the first promise doesn’t remove current lock
    deduper(2); // suppressed due to active lock
    assert.strictEqual(asyncFn.mock.callCount(), 2);
    assert.deepStrictEqual(asyncFn.mock.calls[0].arguments, [0]);
    assert.deepStrictEqual(asyncFn.mock.calls[1].arguments, [1]);
    await resolvers[1].resolve(); // resolving the second promise removes current lock
    deduper(2); // set lock to the third promise
    assert.strictEqual(asyncFn.mock.callCount(), 3);
    assert.deepStrictEqual(asyncFn.mock.calls[2].arguments, [2]);
  });
});
