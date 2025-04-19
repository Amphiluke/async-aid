import {getPromise, putPromise, deletePromise} from './promise-store.mjs';

/**
 * Caches a promise returned by a function call so that repeated call attempts just return that cached promise
 * without relaunching the original function
 * @template T - Awaited type of the original function
 * @param {(...args: *[]) => (T | Promise<T>)} fn - Original function whose results need to be cached
 * @param {object} [options={}] - Additional configuration
 * @param {boolean} [options.cacheRejection=false] - Whether to cache a rejected promise or not
 * @param {function} [options.keyFn] - Function that produces a distinct key to mark independent async processes
 * @returns {(...args: *[]) => Promise<T>} Wrapper function (cacher)
 */
export function createCacher(fn, {cacheRejection = false, keyFn} = {}) {
  const cacher = (...args) => {
    const promiseKey = keyFn?.(...args);
    const cachedPromise = getPromise({fnKey: cacher, promiseKey});
    if (cachedPromise) {
      return cachedPromise;
    }
    const promise = Promise.resolve(fn(...args));
    if (!cacheRejection) {
      promise.catch(() => {
        if (getPromise({fnKey: cacher, promiseKey}) === promise) { // precaution against clearing of superseding cached promise
          deletePromise({fnKey: cacher, promiseKey});
        }
      });
    }
    putPromise({fnKey: cacher, promiseKey, promise});
    return promise;
  };
  return cacher;
}

/**
 * Clears cache of a function that was created by calling `createCacher()`
 * @param {function} cacher - Function created by `createCacher()`
 * @param {*} [key] - A distinct key used to mark independent async processes
 * @returns {boolean} `true` if cache was successfully cleared, or `false` if nothing was cached
 */
export function resetCacher(cacher, key) {
  return deletePromise({fnKey: cacher, promiseKey: key});
}
