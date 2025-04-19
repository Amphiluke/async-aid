var version = "1.0.0";

/** @type {WeakMap<function, Map<*, Promise>>} */
const fnMap = new WeakMap();
const DEFAULT_KEY = Symbol();

/**
 * Get a promise from the store
 * @param {object} options
 * @param {function} options.fnKey - Function used as a key in the store
 * @param {*} [options.promiseKey] - Key in the promise map
 * @returns {Promise | undefined}
 */
function getPromise({fnKey, promiseKey = DEFAULT_KEY}) {
  return fnMap.get(fnKey)?.get(promiseKey);
}

/**
 * Write a promise to the store
 * @param {object} options
 * @param {function} options.fnKey - Function used as a key in the store
 * @param {*} [options.promiseKey] - Key in the promise map
 * @param {Promise} options.promise - Promise instance to put into the store
 */
function putPromise({fnKey, promiseKey = DEFAULT_KEY, promise}) {
  if (fnMap.has(fnKey)) {
    fnMap.get(fnKey).set(promiseKey, promise);
  } else {
    fnMap.set(fnKey, new Map([[promiseKey, promise]]));
  }
}

/**
 * Delete a promise from the store
 * @param {object} options
 * @param {function} options.fnKey - Function used as a key in the store
 * @param {*} [options.promiseKey] - Key in the promise map
 * @returns {boolean} `true` if the promise was successfully deleted, or `false` if no promise found
 */
function deletePromise({fnKey, promiseKey = DEFAULT_KEY}) {
  const promiseMap = fnMap.get(fnKey);
  if (!promiseMap) {
    return false;
  }
  if (promiseKey === DEFAULT_KEY) {
    const hadPromises = promiseMap.size > 0;
    promiseMap.clear();
    fnMap.delete(fnKey);
    return hadPromises;
  }
  if (!promiseMap.delete(promiseKey)) {
    return false;
  }
  if (promiseMap.size < 1) {
    fnMap.delete(fnKey);
  }
  return true;
}

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
function createCacher(fn, {cacheRejection = false, keyFn} = {}) {
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
function resetCacher(cacher, key) {
  return deletePromise({fnKey: cacher, promiseKey: key});
}

/**
 * Creates a wrapper function that protects the original async function from repeated invocations while it is pending.
 * Every such repeated call gets the same pending promise produced by the first call. As soon as the currently pending
 * promise settles, the wrapper allows for a new call of the original function
 * @template T - Awaited type of the original function
 * @param {(...args: *[]) => (T | Promise<T>)} fn - Function to protect from repeated invocations while it is in pending state
 * @param {object} [options] - Additional configuration
 * @param {function} [options.keyFn] - Function that produces a distinct key to mark independent async processes
 * @returns {(...args: *[]) => Promise<T>} Wrapper function (deduper)
 */
function createDeduper(fn, {keyFn} = {}) {
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
function resetDeduper(deduper, key) {
  return deletePromise({fnKey: deduper, promiseKey: key});
}

/**
 * Creates a wrapper function that repeatedly calls the original async function until the latter succeeds or
 * until the allowed number of retries is exceeded.
 * @template T - Awaited type of the original function
 * @param {(...args: *[]) => (T | Promise<T>)} fn - Original function to retry on rejection
 * @param {object} [options={}] - Additional configuration
 * @param {number} [options.maxRetries=1] - Maximum allowed number of consecutive retry attempts
 * @param {number[]} [options.retryDelays=[0]] - Delays (in ms) before making attempts
 * @returns {(...args: *[]) => Promise<T>} Wrapper function (retryer)
 */
function createRetryer(fn, {maxRetries = 1, retryDelays = [0]} = {}) {
  let attemptIndex = 0;
  const retryer = async (...args) => {
    try { 
      return await fn(...args);
    } catch (error) {
      if (++attemptIndex > maxRetries) {
        throw error;
      }
      const delay = retryDelays[attemptIndex - 1] ?? retryDelays.at(-1);
      return await new Promise((resolve) => setTimeout(() => resolve(retryer(...args)), delay));
    } finally {
      attemptIndex = 0;
    }
  };
  return retryer;
}

const CODE_TIMED_OUT = Symbol('Timed out');

/**
 * Creates a wrapper function that returns a rejected promise if execution of the original function takes longer
 * than the specified time limit
 * @template T - Awaited type of the original function
 * @param {(...args: *[]) => (T | Promise<T>)} fn - Original function
 * @param {object} options - Additional configuration
 * @param {number} options.timeout - Time limit in ms
 * @returns {(...args: *[]) => Promise<T>} Wrapper function (timekeeper)
 */
function createTimekeeper(fn, {timeout}) {
  return (...args) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(CODE_TIMED_OUT), timeout);
    Promise.resolve(fn(...args))
      .then(resolve)
      .catch(reject)
      .finally(() => clearTimeout(timer));
  });
}

const VERSION = version;

export { CODE_TIMED_OUT, VERSION, createCacher, createDeduper, createRetryer, createTimekeeper, resetCacher, resetDeduper };
