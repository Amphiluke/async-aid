import assert from 'node:assert';
import {test, describe} from 'node:test';
import {createTimekeeper, CODE_TIMED_OUT} from '../dist/async-aid.mjs';

describe('Timekeeper', () => {
  test('Completing on time', async (context) => {
    context.mock.timers.enable({apis: ['setTimeout']});
    const asyncFn = context.mock.fn(({isSuccess}) => new Promise((resolve, reject) => {
      setTimeout(() => isSuccess ? resolve('I am fast') : reject(new Error('I am fast')), 100);
    }));
    const timekeeper = createTimekeeper(asyncFn, {timeout: 110});
    const promiseSuccess = timekeeper({isSuccess: true});
    const promiseFailure = timekeeper({isSuccess: false});
    context.mock.timers.tick(100);
    assert.strictEqual(await promiseSuccess, 'I am fast');
    assert.deepStrictEqual(asyncFn.mock.calls[0].arguments, [{isSuccess: true}]);
    await assert.rejects(promiseFailure, {name: 'Error', message: 'I am fast'});
    assert.deepStrictEqual(asyncFn.mock.calls[1].arguments, [{isSuccess: false}]);
  });

  test('Failing to complete on time', async (context) => {
    context.mock.timers.enable({apis: ['setTimeout']});
    const asyncFn = context.mock.fn(({isSuccess}) => new Promise((resolve, reject) => {
      setTimeout(() => isSuccess ? resolve('I am fast') : reject(new Error('I am slow')), 150);
    }));
    const timekeeper = createTimekeeper(asyncFn, {timeout: 110});
    const promiseSuccess = timekeeper({isSuccess: true});
    const promiseFailure = timekeeper({isSuccess: false});
    context.mock.timers.tick(110);
    await assert.rejects(promiseSuccess, (reason) => {
      assert.strictEqual(reason, CODE_TIMED_OUT);
      return true;
    });
    assert.deepStrictEqual(asyncFn.mock.calls[0].arguments, [{isSuccess: true}]);
    await assert.rejects(promiseFailure, (reason) => {
      assert.strictEqual(reason, CODE_TIMED_OUT);
      return true;
    });
    assert.deepStrictEqual(asyncFn.mock.calls[1].arguments, [{isSuccess: false}]);
  });
});
