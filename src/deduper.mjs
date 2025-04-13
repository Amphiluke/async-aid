import {getPromise, putPromise, deletePromise} from './promise-store.mjs';

/**
 * Creates a wrapper function that protects the original async function from repeated invocations while it is pending.
 * Every such repeated call gets the same pending promise produced by the first call. As soon as the currently pending
 * promise settles, the wrapper allows for a new call of the original function
 * @param {function} fn - Function to protect from repeated invocations while it is in pending state
 * @param {object} [options] - Additional configuration
 * @param {function} [options.keyFn] - Function that produces a distinct key to mark independent async processes
 * @returns {(...*) => Promise} Wrapper function (deduper)
 */
export function createDeduper(fn, {keyFn} = {}) {
  const deduper = (...args) => {
    const promiseKey = keyFn?.(...args);
    const pendingPromise = getPromise({fnKey: deduper, promiseKey});
    if (pendingPromise) {
      return pendingPromise;
    }
    const promise = Promise.resolve(fn(...args)).finally(() => {
      if (getPromise({fnKey: deduper, promiseKey}) === promise) { // precaution against clearing of superseding dedupe lock
        deletePromise({fnKey: deduper, promiseKey});
      }
    });
    putPromise({fnKey: deduper, promiseKey, promise});
    return promise;
  };
  return deduper;
}

/**
 * Resets a deduper to the initial state by clearing currently active dedupe lock
 * @param {function} deduper - Function created by `createDeduper()` 
 * @param {*} [key] - A distinct key used to mark independent async processes
 * @returns {boolean} `true` if the dedupe lock was successfully removed, or `false` if no active lock existed
 */
export function resetDeduper(deduper, key) {
  return deletePromise({fnKey: deduper, promiseKey: key});
}
