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
export function getPromise({fnKey, promiseKey = DEFAULT_KEY}) {
  return fnMap.get(fnKey)?.get(promiseKey);
}

/**
 * Write a promise to the store
 * @param {object} options
 * @param {function} options.fnKey - Function used as a key in the store
 * @param {*} [options.promiseKey] - Key in the promise map
 * @param {Promise} options.promise - Promise instance to put into the store
 */
export function putPromise({fnKey, promiseKey = DEFAULT_KEY, promise}) {
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
export function deletePromise({fnKey, promiseKey = DEFAULT_KEY}) {
  const promiseMap = fnMap.get(fnKey);
  if (!promiseMap?.delete(promiseKey)) {
    return false;
  }
  if (promiseMap.size < 1) {
    fnMap.delete(fnKey);
  }
  return true;
}
