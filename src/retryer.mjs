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
export function createRetryer(fn, {maxRetries = 1, retryDelays = [0], canRetry} = {}) {
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
