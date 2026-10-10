/** Exact protocol coordinates. */

export interface ApiReference {
  readonly apiVersion: string
  readonly kind: string
}

export function protocolKey(reference: ApiReference): string {
  return `${reference.apiVersion}\0${reference.kind}`
}

export function sameProtocol(left: ApiReference, right: ApiReference): boolean {
  return left.apiVersion === right.apiVersion && left.kind === right.kind
}

export function validateApiReference(value: unknown, label = 'protocol reference'): asserts value is ApiReference {
  if (!record(value)) throw new TypeError(`${label} must be an object`)
  if (typeof value.apiVersion !== 'string') throw new TypeError(`${label}.apiVersion must be a string`)
  if (!/^[a-z][a-z0-9.-]*\/v[1-9][0-9]*(?:(?:alpha|beta)[1-9][0-9]*)?$/u.test(value.apiVersion)) {
    throw new TypeError(`invalid apiVersion ${JSON.stringify(value.apiVersion)}`)
  }
  if (typeof value.kind !== 'string' || !/^[A-Z][A-Za-z0-9]*$/u.test(value.kind)) {
    throw new TypeError(`${label}.kind is invalid`)
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
