/** Participant requirements and live supports. */
import { protocolKey, validateApiReference, type ApiReference } from './identity.js'
import { validateProtocolJsonValue } from './json.js'
import { deepFreeze } from './internal/snapshot.js'

export interface ProtocolRequirement<Spec = unknown> extends ApiReference {
  readonly optional?: boolean
  readonly spec?: Spec
}

export interface ProtocolSupport<Spec = unknown> extends ApiReference {
  readonly spec?: Spec
}

export interface ProtocolDeclaration {
  /** Unique within this declaration's negotiation scope. */
  readonly participant: { readonly id: string }
  readonly requires?: readonly ProtocolRequirement[]
  readonly supports?: readonly ProtocolSupport[]
}

export function validateProtocolDeclaration(value: unknown): asserts value is ProtocolDeclaration {
  if (!record(value)) throw new TypeError('protocol declaration must be an object')
  exact(value, ['participant', 'requires', 'supports'], 'protocol declaration')
  if (!record(value.participant)) throw new TypeError('protocol declaration participant must be an object')
  exact(value.participant, ['id'], 'participant identity')
  nonEmpty(value.participant.id, 'participant identity.id')
  validateRows(value.requires, true)
  validateRows(value.supports, false)
}

export function defineProtocolDeclaration<const T extends ProtocolDeclaration>(declaration: T): T {
  validateProtocolDeclaration(declaration)
  return deepFreeze(structuredClone(declaration))
}

function validateRows(value: unknown, requirement: boolean): void {
  if (value === undefined) return
  const label = requirement ? 'protocol requirements' : 'protocol supports'
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`)
  const seen = new Set<string>()
  for (const [index, rowValue] of value.entries()) {
    const rowLabel = `${label}[${index}]`
    validateApiReference(rowValue, rowLabel)
    const row = rowValue as unknown as Record<string, unknown>
    exact(row, requirement ? ['apiVersion', 'kind', 'optional', 'spec'] : ['apiVersion', 'kind', 'spec'], rowLabel)
    if (requirement && row.optional !== undefined && typeof row.optional !== 'boolean') {
      throw new TypeError(`${rowLabel}.optional must be boolean`)
    }
    // Explicit undefined was accepted by the original v1alpha1 TypeScript API
    // and remains equivalent to omission. Every material spec is wire data.
    if (Object.hasOwn(row, 'spec') && row.spec !== undefined) {
      validateProtocolJsonValue(row.spec, `${rowLabel}.spec`)
    }
    const key = protocolKey(row as unknown as ApiReference)
    if (seen.has(key)) throw new TypeError(`${label} contains duplicate ${JSON.stringify(key)}`)
    seen.add(key)
  }
}

function nonEmpty(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${label} must be a non-empty string`)
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function exact(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const unknown = Object.keys(value).filter(key => !allowed.includes(key) && !key.startsWith('x-'))
  if (unknown.length > 0) throw new TypeError(`${label} contains unknown field ${JSON.stringify(unknown[0])}`)
}
