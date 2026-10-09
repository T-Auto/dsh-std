import { describe, expect, it, vi } from 'vitest'
import { ProtocolCatalog, defineProtocolDeclaration, type ProtocolRequirement, type ProtocolSupport } from '@dsh-std/core'
import {
  API_VERSION,
  API_VERSION_V2,
  CONTRIBUTION_HOST_KIND,
  bindContributionHosts,
  contributionHostProtocolV2,
  contributionHostRequirement,
  contributionHostRequirementV2,
  contributionHostSupport,
  contributionHostSupportV2,
  register,
  validateContributionHostRequirement,
  validateContributionHostRequirementV2,
  type ContributionHostAgreement,
} from '../src/index.js'

const PANEL = { apiVersion: 'example.ui/v1alpha1', kind: 'Panel' } as const
const STATUS = { apiVersion: 'example.ui/v1alpha1', kind: 'Status' } as const
const panel = { ...PANEL, mode: 'local-module' } as const
const status = { ...STATUS, mode: 'host-rendered' } as const
const panelSupport = { surfaces: [{ ...PANEL, modes: ['local-module'] as const }] }
const statusSupport = { surfaces: [{ ...STATUS, modes: ['host-rendered'] as const }] }
const owner = {
  component: 'example.plugin', version: '1.0.0', facet: 'ui',
  instanceId: 'activation', participantId: 'consumer',
}

function negotiate(requirement: ProtocolRequirement, supports: readonly ProtocolSupport[] = [contributionHostSupportV2(panelSupport)]) {
  const catalog = new ProtocolCatalog({ name: 'test', version: '1.0.0' })
  register(catalog)
  return catalog.negotiate([
    defineProtocolDeclaration({ participant: { id: owner.participantId }, requires: [requirement] }),
    ...supports.map((support, index) => defineProtocolDeclaration({ participant: { id: 'provider-' + index }, supports: [support] })),
  ])
}

function mixedRequirement() {
  return contributionHostRequirementV2({ surfaces: [panel], optionalSurfaces: [status] })
}

describe('ContributionHost v1alpha2 optional surfaces', () => {
  it('retains the v1alpha1 coordinate and strict all-required validator', () => {
    expect(contributionHostRequirement({ surfaces: [panel] }).apiVersion).toBe(API_VERSION)
    expect(contributionHostSupport(panelSupport).apiVersion).toBe(API_VERSION)
    expect(() => validateContributionHostRequirement({ surfaces: [panel], optionalSurfaces: [status] }))
      .toThrow(/unknown field/u)
    expect(() => defineProtocolDeclaration({ participant: { id: 'consumer' }, requires: [
      contributionHostRequirement({ surfaces: [panel] }),
      contributionHostRequirement({ surfaces: [status] }, true),
    ] })).toThrow(/duplicate/u)
  })

  it('omits unavailable optional surfaces without blocking the required panel', async () => {
    const report = negotiate(mixedRequirement())
    expect(report.compatible).toBe(true)
    expect(report.issues).toEqual([expect.objectContaining({ code: 'ui-surface-unavailable', severity: 'warning' })])
    expect(report.protocols[0]?.apiVersion).toBe(API_VERSION_V2)
    const agreement = report.protocols[0]!.agreement as ContributionHostAgreement
    expect(agreement.surfaces).toEqual([{ ...PANEL, consumer: 'consumer', provider: 'provider-0', mode: 'local-module' }])
    const registerPanel = vi.fn(() => () => {})
    const bound = bindContributionHosts(agreement, owner, [{
      participantId: 'provider-0', support: panelSupport, register: registerPanel,
    }])
    expect(() => bound.client.register({ descriptor: { id: 'status', surface: STATUS, content: {} } }))
      .toThrow(/was not negotiated/u)
    expect(registerPanel).not.toHaveBeenCalled()
    await bound.close()
  })

  it('binds available required and optional surfaces to their selected providers', async () => {
    const report = negotiate(mixedRequirement(), [contributionHostSupportV2(panelSupport), contributionHostSupportV2(statusSupport)])
    expect(report.compatible).toBe(true)
    expect(report.issues).toEqual([])
    const disposed: string[] = []
    const bound = bindContributionHosts(report.protocols[0]!.agreement as ContributionHostAgreement, owner, [
      { participantId: 'provider-0', support: panelSupport, register: () => () => { disposed.push('panel') } },
      { participantId: 'provider-1', support: statusSupport, register: () => () => { disposed.push('status') } },
    ])
    expect(bound.client.surfaces).toHaveLength(2)
    bound.client.register({ descriptor: { id: 'panel', surface: PANEL, content: {} }, localModule: () => null })
    bound.client.register({ descriptor: { id: 'status', surface: STATUS, content: { text: 'ready' } } })
    await bound.close()
    expect(disposed).toEqual(['status', 'panel'])
  })

  it('still rejects a missing required surface when the optional surface is available', () => {
    const report = negotiate(mixedRequirement(), [contributionHostSupportV2(statusSupport)])
    expect(report.compatible).toBe(false)
    expect(report.issues).toEqual([expect.objectContaining({ code: 'ui-surface-unavailable', severity: 'error' })])
  })

  it('warns for an optional unsupported content mode and for a wholly optional requirement', () => {
    const wrongMode = contributionHostSupportV2({ surfaces: [{ ...STATUS, modes: ['local-module'] }] })
    expect(negotiate(mixedRequirement(), [contributionHostSupportV2(panelSupport), wrongMode]).issues)
      .toEqual([expect.objectContaining({ code: 'ui-surface-unavailable', severity: 'warning' })])
    const whollyOptional = negotiate(contributionHostRequirementV2({ surfaces: [panel], optionalSurfaces: [status] }, true), [])
    expect(whollyOptional.compatible).toBe(true)
    expect(whollyOptional.issues).toHaveLength(2)
    expect(whollyOptional.issues.every(issue => issue.severity === 'warning')).toBe(true)
  })

  it('does not guess between ambiguous optional surface providers', () => {
    const report = negotiate(mixedRequirement(), [
      contributionHostSupportV2(panelSupport), contributionHostSupportV2(statusSupport), contributionHostSupportV2(statusSupport),
    ])
    expect(report.compatible).toBe(false)
    expect(report.issues).toEqual([expect.objectContaining({ code: 'ui-placement-conflict', severity: 'error' })])
    expect((report.protocols[0]!.agreement as ContributionHostAgreement).surfaces).toHaveLength(1)
  })

  it('does not infer v1alpha2 support from a v1alpha1 provider', () => {
    const report = negotiate(mixedRequirement(), [contributionHostSupport(panelSupport)])
    expect(report.compatible).toBe(false)
    expect(report.issues).toContainEqual(expect.objectContaining({ code: 'ui-surface-unavailable', severity: 'error' }))
  })

  it('validates both arrays and rejects duplicate coordinates across them', () => {
    expect(() => validateContributionHostRequirementV2({ surfaces: [], optionalSurfaces: [status] })).toThrow(/non-empty/u)
    expect(() => validateContributionHostRequirementV2({ surfaces: [panel], optionalSurfaces: {} })).toThrow(/must be an array/u)
    expect(() => validateContributionHostRequirementV2({ surfaces: [panel], optionalSurfaces: [panel] })).toThrow(/duplicate/u)
    expect(() => validateContributionHostRequirementV2({ surfaces: [panel], optionalSurfaces: [status, status] })).toThrow(/duplicate/u)
    expect(() => validateContributionHostRequirementV2({ surfaces: [panel], optionalSurfaces: [{ ...status, extra: true }] }))
      .toThrow(/unknown field/u)
    const input = { surfaces: [panel], optionalSurfaces: [status] }
    const value = validateContributionHostRequirementV2(input)
    expect(Object.isFrozen(value.optionalSurfaces)).toBe(true)
    expect(value.optionalSurfaces).not.toBe(input.optionalSurfaces)
  })

  it('registers and disposes both definitions, rolling back a partial registration', () => {
    const catalog = new ProtocolCatalog({ name: 'test', version: '1.0.0' })
    const dispose = register(catalog)
    expect(catalog.understands({ apiVersion: API_VERSION, kind: CONTRIBUTION_HOST_KIND })).toBe(true)
    expect(catalog.understands({ apiVersion: API_VERSION_V2, kind: CONTRIBUTION_HOST_KIND })).toBe(true)
    dispose()
    expect(catalog.list()).toHaveLength(0)
    catalog.register(contributionHostProtocolV2)
    expect(() => register(catalog)).toThrow(/already registered/u)
    expect(catalog.understands({ apiVersion: API_VERSION, kind: CONTRIBUTION_HOST_KIND })).toBe(false)
    expect(catalog.list()).toHaveLength(1)
  })
})
