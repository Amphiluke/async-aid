var version = "1.1.1";

/** @type {WeakMap<function, Map<*, object>>} */
const fnMap = new WeakMap();
const DEFAULT_KEY = Symbol();

/**
 * Get an entity from the store
 * @param {object} options
 * @param {function} options.fnKey - Function used as a key in the store
 * @param {*} [options.entityKey] - Key in the entity map
 * @returns {object | undefined}
 */
function getEntity({fnKey, entityKey = DEFAULT_KEY}) {
  return fnMap.get(fnKey)?.get(entityKey);
}

/**
 * Write an entity to the store
 * @param {object} options
 * @param {function} options.fnKey - Function used as a key in the store
 * @param {*} [options.entityKey] - Key in the entity map
 * @param {object} options.entity - Entity to put into the store
 */
function putEntity({fnKey, entityKey = DEFAULT_KEY, entity}) {
  if (fnMap.has(fnKey)) {
    fnMap.get(fnKey).set(entityKey, entity);
  } else {
    fnMap.set(fnKey, new Map([[entityKey, entity]]));
  }
}

/**
 * Delete an entity from the store
 * @param {object} options
 * @param {function} options.fnKey - Function used as a key in the store
 * @param {*} [options.entityKey] - Key in the entity map
 * @returns {boolean} `true` if the entity was successfully deleted, or `false` if no entity found
 */
function deleteEntity({fnKey, entityKey = DEFAULT_KEY}) {
  const entityMap = fnMap.get(fnKey);
  if (!entityMap) {
    return false;
  }
  if (entityKey === DEFAULT_KEY) {
    const hadEntities = entityMap.size > 0;
    entityMap.clear();
    fnMap.delete(fnKey);
    return hadEntities;
  }
  if (!entityMap.delete(entityKey)) {
    return false;
  }
  if (entityMap.size < 1) {
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
    const entityKey = keyFn?.(...args);
    const cachedPromise = getEntity({fnKey: cacher, entityKey});
    if (cachedPromise) {
      return cachedPromise;
    }
    const promise = Promise.resolve(fn(...args));
    if (!cacheRejection) {
      promise.catch(() => {
        if (getEntity({fnKey: cacher, entityKey}) === promise) { // precaution against clearing of superseding cached promise
          deleteEntity({fnKey: cacher, entityKey});
        }
      });
    }
    putEntity({fnKey: cacher, entityKey, entity: promise});
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
  return deleteEntity({fnKey: cacher, entityKey: key});
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
    const entityKey = keyFn?.(...args);
    const pendingPromise = getEntity({fnKey: deduper, entityKey});
    if (pendingPromise) {
      return pendingPromise;
    }
    const promise = Promise.resolve(fn(...args)).finally(() => {
      if (getEntity({fnKey: deduper, entityKey}) === promise) { // precaution against clearing of superseding dedupe lock
        deleteEntity({fnKey: deduper, entityKey});
      }
    });
    putEntity({fnKey: deduper, entityKey, entity: promise});
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
  return deleteEntity({fnKey: deduper, entityKey: key});
}

/**
 * Creates a wrapper function that repeatedly calls the original async function until the latter succeeds or
 * until the allowed number of retries is exceeded.
 * @template T - Awaited type of the original function
 * @param {(...args: *[]) => (T | Promise<T>)} fn - Original function to retry on rejection
 * @param {object} [options={}] - Additional configuration
 * @param {number} [options.maxRetries=1] - Maximum allowed number of consecutive retry attempts
 * @param {number[]} [options.retryDelays=[0]] - Delays (in ms) before making attempts
 * @param {(error: *) => (boolean | Promise<boolean>)} [options.canRetry] - Function that determines if retry is appropriate for a particular error
 * @returns {(...args: *[]) => Promise<T>} Wrapper function (retryer)
 */
function createRetryer(fn, {maxRetries = 1, retryDelays = [0], canRetry} = {}) {
  let attemptIndex = 0;
  const retryer = async (...args) => {
    try { 
      return await fn(...args);
    } catch (error) {
      if (++attemptIndex > maxRetries) {
        throw error;
      }
      if (await canRetry?.(error) === false) {
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

/**
 * Creates a wrapper function that returns a promise. If the wrapper is called multiple times while a previous call
 * is still pending, only the most recent call’s result is used. All pending promises settle with the result or error
 * of the latest call.
 * @template T - Awaited type of the original function
 * @param {(...args: *[]) => (T | Promise<T>)} fn - Original function
 * @param {object} [options] - Additional configuration
 * @param {function} [options.keyFn] - Function that produces a distinct key to mark independent async processes
 * @returns {(...args: *[]) => Promise<T>} Wrapper function (superseder)
 */
function createSuperseder(fn, {keyFn} = {}) {
  const superseder = (...args) => new Promise((resolve, reject) => {
    const entityKey = keyFn?.(...args);
    const settlers = getEntity({fnKey: superseder, entityKey}) ?? [];
    settlers.push({resolve, reject});
    putEntity({fnKey: superseder, entityKey, entity: settlers});
    Promise.resolve(fn(...args))
      .then((result) => {
        const settlers = getEntity({fnKey: superseder, entityKey});
        if (resolve === settlers?.at(-1).resolve) {
          settlers.forEach((settler) => settler.resolve(result));
          deleteEntity({fnKey: superseder, entityKey});
        }
      })
      .catch((reason) => {
        const settlers = getEntity({fnKey: superseder, entityKey});
        if (reject === settlers?.at(-1).reject) {
          settlers.forEach((settler) => settler.reject(reason));
          deleteEntity({fnKey: superseder, entityKey});
        }
      });
  });
  return superseder;
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

export { CODE_TIMED_OUT, VERSION, createCacher, createDeduper, createRetryer, createSuperseder, createTimekeeper, resetCacher, resetDeduper };
