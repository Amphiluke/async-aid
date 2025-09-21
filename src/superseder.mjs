import {getEntity, putEntity, deleteEntity} from './entity-store.mjs';

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
export function createSuperseder(fn, {keyFn} = {}) {
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
