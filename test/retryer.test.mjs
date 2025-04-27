import assert from 'node:assert';
import {test, describe} from 'node:test';
import {setImmediate} from 'node:timers/promises';
import {createRetryer} from '../dist/async-aid.mjs';

describe('Retryer', () => {
  test('Processing immediate success', async (context) => {
    const result = Symbol();
    const asyncFn = context.mock.fn(() => Promise.resolve(result));
    const retryer = createRetryer(asyncFn);
    assert.strictEqual(await retryer(), result);
    assert.strictEqual(asyncFn.mock.callCount(), 1);
  });

  test('Making exactly one retry by default', async (context) => {
    const asyncFn = context.mock.fn(() => Promise.reject(new Error('Never fulfills')));
    const retryer = createRetryer(asyncFn);
    await assert.rejects(retryer(7, {key: 'val'}), {name: 'Error', message: 'Never fulfills'});
    assert.strictEqual(asyncFn.mock.callCount(), 2); // two attempts, where the last is a single retry
    asyncFn.mock.calls.forEach(({arguments: args}) => assert.deepStrictEqual(args, [7, {key: 'val'}]));
  });

  test('Custom number of retries', async (context) => {
    let counter = 0;
    const asyncFn = context.mock.fn(() => (++counter > 3) ? Promise.resolve('Ok, enough') : Promise.reject('Try again'));
    const retryer = createRetryer(asyncFn, {maxRetries: 10});
    assert.strictEqual(await retryer([1, 2, 3], true), 'Ok, enough');
    assert.strictEqual(asyncFn.mock.callCount(), 4);
    asyncFn.mock.calls.forEach(({arguments: args}) => assert.deepStrictEqual(args, [[1, 2, 3], true]));
  });

  test('Custom retry delays', async (context) => {
    let counter = 0;
    const asyncFn = context.mock.fn(() => (++counter > 3) ? Promise.resolve('Ok, enough') : Promise.reject('Try again'));
    const retryer = createRetryer(asyncFn, {maxRetries: 3, retryDelays: [1000, 5000]});
    context.mock.timers.enable({apis: ['setTimeout']});
    retryer();
    const tickToCalls = [[0, 1], [500, 1], [500, 2], [3000, 2], [2000, 3], [4500, 3], [500, 4]];
    for (const [tick, callCount] of tickToCalls) {
      context.mock.timers.tick(tick);
      await setImmediate();
      assert.strictEqual(asyncFn.mock.callCount(), callCount);
    }
  });

  test('Reset attempts counter on completion', async (context) => {
    let counter = 0;
    const asyncFn = context.mock.fn(() => (++counter > 7) ? Promise.resolve('Ok, enough') : Promise.reject('Try again'));
    const retryer = createRetryer(asyncFn, {maxRetries: 3});
    await assert.rejects(retryer);
    assert.strictEqual(asyncFn.mock.callCount(), 4); // 1+3 attempts used but next call has 1+3 more
    assert.strictEqual(await retryer(), 'Ok, enough');
    assert.strictEqual(asyncFn.mock.callCount(), 8); // new 1+3 attempts used
  });

  test('User defined error checker', async (context) => {
    const asyncFn = context.mock.fn((data) => Promise.reject(new Error(`Fail #${data.counter++}`)));
    const retryer = createRetryer(asyncFn, {
      maxRetries: 10,
      canRetry: ({message}) => message !== 'Fail #3',
    });
    await assert.rejects(() => retryer({counter: 1}), {name: 'Error', message: 'Fail #3'});
    assert.strictEqual(asyncFn.mock.callCount(), 3);
  });
});
