export function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const k of Object.keys(o)) deepFreeze(o[k]);
  }
  return o;
}

export const clone = (o) => structuredClone(o);

/**
 * Own-property lookup for maps keyed by learner-supplied text. Plain-object `obj['constructor']` /
 * `obj['toString']` / `obj['__proto__']` return inherited values, so every learner-reachable lookup uses this.
 */
export const hasOwn = (o, k) => o != null && typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
export const own = (o, k) => (hasOwn(o, k) ? o[k] : undefined);
