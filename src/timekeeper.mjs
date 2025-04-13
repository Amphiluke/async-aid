export const CODE_TIMED_OUT = Symbol('Timed out');

/**
 * Creates a wrapper function that returns a rejected promise if execution of the original function takes longer
 * than the specified time limit
 * @param {function} fn - Original function
 * @param {object} options - Additional configuration
 * @param {number} options.timeout - Time limit in ms
 * @returns {(...*) => Promise} Wrapper function (timekeeper)
 */
export function createTimekeeper(fn, {timeout}) {
  return (...args) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(CODE_TIMED_OUT), timeout);
    Promise.resolve(fn(...args))
      .then(resolve)
      .catch(reject)
      .finally(() => clearTimeout(timer));
  });
}
