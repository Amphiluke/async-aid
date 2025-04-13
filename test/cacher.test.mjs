import assert from 'node:assert';
import {test, describe} from 'node:test';
import {createCacher, resetCacher} from '../dist/async-aid.mjs';

describe('Cacher', () => {
  test('Protecting an async function from repeated calls', async (context) => {
    const asyncFn = context.mock.fn(() => Promise.resolve());
    const cacher = createCacher(asyncFn);
    for (let i = 0; i < 5; i++) await cacher();
    assert.strictEqual(asyncFn.mock.callCount(), 1);
  });

  test('Cacher returns the same result on repeated calls', async () => {
    const asyncFn = () => Promise.resolve(Symbol());
    const cacher = createCacher(asyncFn);
    assert.strictEqual(cacher(), cacher());
    assert.strictEqual(await cacher(), await cacher());
    assert.strictEqual(typeof await cacher(), 'symbol');
  });

  test('Key-based differentiation of independently cached processes', async (context) => {
    const asyncFn = context.mock.fn((number) => Promise.resolve(number));
    const cacher = createCacher(asyncFn, {keyFn: (number) => number});
    const numbers = [0, 0, 1, 0, 1, 2, 2, 1, 0, 7, 2];
    const uniqueNumbers = Array.from(new Set(numbers));
    const results = await Promise.all(numbers.map((number) => cacher(number)));
    assert.deepStrictEqual(results, numbers);
    assert.strictEqual(asyncFn.mock.callCount(), uniqueNumbers.length);
    uniqueNumbers.forEach((number, index) => assert.deepStrictEqual(asyncFn.mock.calls[index].arguments, [number]));
  });

  test('Cache auto-cleanup induced by rejection', async () => {
    const asyncFn = (number) => number < 0 ? Promise.reject(new Error(String(number))) : Promise.resolve(number);
    const cacher = createCacher(asyncFn);
    await assert.rejects(cacher(-1), {name: 'Error', message: '-1'});
    await assert.rejects(cacher(-5), {name: 'Error', message: '-5'});
    assert.strictEqual(await cacher(1), 1);
    assert.strictEqual(await cacher(-1), 1);
  });

  test('Caching rejection', async () => {
    const asyncFn = (number) => number < 0 ? Promise.reject(new Error(String(number))) : Promise.resolve(number);
    const cacher = createCacher(asyncFn, {cacheRejection: true});
    await assert.rejects(cacher(-1), {name: 'Error', message: '-1'});
    await assert.rejects(cacher(-5), {name: 'Error', message: '-1'});
    await assert.rejects(cacher(1), {name: 'Error', message: '-1'});
  });

  test('Manual cache cleanup', async (context) => {
    const asyncFn = context.mock.fn(() => Promise.resolve());
    const cacher = createCacher(asyncFn);
    assert.strictEqual(resetCacher(cacher), false);
    await cacher();
    await cacher();
    assert.strictEqual(asyncFn.mock.callCount(), 1);
    assert.strictEqual(resetCacher(cacher), true);
    await cacher();
    assert.strictEqual(asyncFn.mock.callCount(), 2);
  });

  test('Selective key-based cache cleanup', async (context) => {
    const asyncFn = context.mock.fn((a, b) => Promise.resolve(a + b));
    const cacher = createCacher(asyncFn, {keyFn: (a, b) => `${typeof a}+${typeof b}`});
    assert.strictEqual(await cacher(0, 1), 1);
    assert.strictEqual(await cacher(2, 3), 1);
    assert.strictEqual(await cacher('00', '11'), '0011');
    assert.strictEqual(await cacher('22', '33'), '0011');
    assert.strictEqual(asyncFn.mock.callCount(), 2);
    resetCacher(cacher, 'string+string');
    assert.strictEqual(await cacher(4, 5), 1);
    assert.strictEqual(await cacher('44', '55'), '4455');
    assert.strictEqual(await cacher('66', '77'), '4455');
    assert.strictEqual(asyncFn.mock.callCount(), 3);
  });

  test('Prevent clearing of superseding cache', async (context) => {
    const resolvers = [Promise.withResolvers(), Promise.withResolvers(), Promise.withResolvers()];
    const asyncFn = context.mock.fn((index) => resolvers[index].promise);
    const cacher = createCacher(asyncFn);
    cacher(0); // cache the first promise
    cacher(0); // suppressed due to existing cache
    resetCacher(cacher); // clear cache
    cacher(1); // cache the second promise
    await resolvers[0].reject(); // rejecting the first promise doesn’t clear superseding cache
    cacher(2); // suppressed due to active lock
    assert.strictEqual(asyncFn.mock.callCount(), 2);
    assert.deepStrictEqual(asyncFn.mock.calls[0].arguments, [0]);
    assert.deepStrictEqual(asyncFn.mock.calls[1].arguments, [1]);
    await resolvers[1].reject(); // rejecting the second promise clears cache
    cacher(2); // cache the third promise
    assert.strictEqual(asyncFn.mock.callCount(), 3);
    assert.deepStrictEqual(asyncFn.mock.calls[2].arguments, [2]);
  });
});
