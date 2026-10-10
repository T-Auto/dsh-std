import { deepFreeze } from './internal/snapshot.js'

export type ProtocolJsonPrimitive = null | boolean | number | string
export type ProtocolJsonValue =
  | ProtocolJsonPrimitive
  | readonly ProtocolJsonValue[]
  | { readonly [key: string]: ProtocolJsonValue }

/** Validate data that may cross a manifest, agreement, or protocol wire boundary. */
export function validateProtocolJsonValue(value: unknown, label = 'protocol JSON value'): asserts value is ProtocolJsonValue {
  jsonValue(value, label, new Set<object>())
}

/** Snapshot and deeply freeze lossless JSON data before publication or async work. */
export function freezeProtocolJsonValue(value: unknown, label = 'protocol JSON value'): ProtocolJsonValue {
  validateProtocolJsonValue(value, label)
  return deepFreeze(structuredClone(value)) as ProtocolJsonValue
}

function jsonValue(value: unknown, label: string, ancestors: Set<object>): void {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0)) throw new TypeError(`${label} must contain only lossless JSON numbers`)
    return
  }
  if (typeof value !== 'object') throw new TypeError(`${label} must be lossless JSON data`)
  if (ancestors.has(value)) throw new TypeError(`${label} must not contain cycles`)
  ancestors.add(value)
  if (Array.isArray(value)) {
    if (Reflect.ownKeys(value).length !== value.length + 1) throw new TypeError(`${label} must be a dense JSON array without extra properties`)
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) throw new TypeError(`${label} must not contain sparse array slots`)
    }
    for (const [index, child] of value.entries()) jsonValue(child, `${label}[${index}]`, ancestors)
  } else {
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`${label} must contain only plain objects`)
    }
    const keys = Reflect.ownKeys(value)
    if (keys.some(key => typeof key !== 'string' || !Object.prototype.propertyIsEnumerable.call(value, key))) {
      throw new TypeError(`${label} must contain only enumerable string keys`)
    }
    for (const [key, child] of Object.entries(value)) jsonValue(child, `${label}.${key}`, ancestors)
  }
  ancestors.delete(value)
}
