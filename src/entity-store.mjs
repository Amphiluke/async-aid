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
export function getEntity({fnKey, entityKey = DEFAULT_KEY}) {
  return fnMap.get(fnKey)?.get(entityKey);
}

/**
 * Write an entity to the store
 * @param {object} options
 * @param {function} options.fnKey - Function used as a key in the store
 * @param {*} [options.entityKey] - Key in the entity map
 * @param {object} options.entity - Entity to put into the store
 */
export function putEntity({fnKey, entityKey = DEFAULT_KEY, entity}) {
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
export function deleteEntity({fnKey, entityKey = DEFAULT_KEY}) {
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
