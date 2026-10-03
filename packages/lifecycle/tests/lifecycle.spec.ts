import { describe, expect, it } from 'vitest'
import { ProtocolCatalog } from '@dsh-std/core'
import { compose } from '@dsh-std/composition'
import { defineComponentManifest } from '@dsh-std/manifest'
import {
  ActivationDriverRegistry,
  FACET_MODULE_API_VERSION,
  FACET_MODULE_KIND,
  LifecycleCoordinator,
  facetModuleActivationDefinition,
} from '../src/index.js'

function fixture() {
  const protocols = new ProtocolCatalog({ name: 'test', version: '1.0.0' })
  protocols.register({
    apiVersion: 'example.dsh/v1alpha1', kind: 'Service',
    validateRequirement: value => value,
    validateSupport: value => value,
    negotiate(input) {
      return input.requirements.length > 0 && input.supports.length === 0
        ? { issues: [{ code: 'support-missing', severity: 'error', message: 'service support is missing' }] }
        : { agreement: { available: input.supports.length > 0 } }
    },
  })
  const manifest = defineComponentManifest({
    apiVersion: 'manifest.dsh/internal/v1alpha1', kind: 'Component',
    metadata: { name: 'example.service.provider', version: '1.0.0' },
    spec: { facets: [{
      name: 'runtime',
      activation: { apiVersion: 'adapter.test/v1alpha1', kind: 'Entrypoint', spec: {} },
      protocols: { supports: [{ apiVersion: 'example.dsh/v1alpha1', kind: 'Service' }] },
    }] },
  })
  return { protocols, manifest }
}

describe('@dsh-std/lifecycle', () => {
  it('defines a portable FacetModule activation without naming a product adapter', () => {
    expect(facetModuleActivationDefinition).toMatchObject({
      apiVersion: FACET_MODULE_API_VERSION,
      kind: FACET_MODULE_KIND,
    })
    expect(facetModuleActivationDefinition.validateSpec({ module: 'example/standard' }))
      .toEqual({ module: 'example/standard' })
  })

  it('publishes staged support only after activation returns', async () => {
    const { protocols, manifest } = fixture()
    const drivers = new ActivationDriverRegistry()
    let visibleDuringActivation = -1
    drivers.register({
      id: 'example.driver', apiVersion: 'adapter.test/v1alpha1', kind: 'Entrypoint',
      activate({ context }) {
        context.protocols.implement({ apiVersion: 'example.dsh/v1alpha1', kind: 'Service' }, { handle: true })
        visibleDuringActivation = coordinator.publications.list().length
      },
    })
    const plan = compose({ manifests: [manifest], protocols, drivers: drivers.descriptors() })
    const coordinator = new LifecycleCoordinator(protocols, drivers)
    const [handle] = await coordinator.activate(plan)
    expect(visibleDuringActivation).toBe(0)
    expect(coordinator.publications.declarations()).toEqual([expect.objectContaining({
      participant: { id: 'example.service.provider@1.0.0#runtime@generation-1' },
      supports: [{ apiVersion: 'example.dsh/v1alpha1', kind: 'Service' }],
    })])
    expect(handle?.identity).toMatchObject({
      generation: 1,
      participantId: 'example.service.provider@1.0.0#runtime@generation-1',
    })
    await handle?.deactivate()
    expect(coordinator.publications.list()).toEqual([])
  })

  it('rolls back undeclared support without publishing it', async () => {
    const { protocols, manifest } = fixture()
    const drivers = new ActivationDriverRegistry()
    drivers.register({
      id: 'example.driver', apiVersion: 'adapter.test/v1alpha1', kind: 'Entrypoint',
      activate({ context }) {
        context.protocols.implement({ apiVersion: 'other.dsh/v1alpha1', kind: 'Other' }, {})
      },
    })
    const coordinator = new LifecycleCoordinator(protocols, drivers)
    const plan = compose({ manifests: [manifest], protocols, drivers: drivers.descriptors() })
    await expect(coordinator.activate(plan)).rejects.toThrow(/undeclared protocol/)
    expect(coordinator.publications.list()).toEqual([])
  })

  it('publishes a projected extension by its preserved Community contribution id', async () => {
    const protocols = new ProtocolCatalog({ name: 'test', version: '1.0.0' })
    const manifest = defineComponentManifest({
      apiVersion: 'manifest.dsh/internal/v1alpha1', kind: 'Component',
      metadata: { name: 'example.loop-detector', version: '1.0.0' },
      spec: { facets: [{
        name: 'runtime',
        activation: { apiVersion: 'adapter.test/v1alpha1', kind: 'Entrypoint', spec: {} },
        extensions: [{
          apiVersion: 'commands.dsh/v1alpha1', kind: 'Command',
          metadata: {
            name: 'status',
            labels: { 'dsh.std/contribution-id': 'example.loop-detector.status' },
          },
          spec: { title: 'Status' },
        }],
      }] },
    })
    const drivers = new ActivationDriverRegistry()
    drivers.register({
      id: 'example.driver', apiVersion: 'adapter.test/v1alpha1', kind: 'Entrypoint',
      activate({ context }) {
        context.extensions.publish(
          { apiVersion: 'commands.dsh/v1alpha1', kind: 'Command' },
          'example.loop-detector.status',
          { execute: true },
        )
      },
    })
    const coordinator = new LifecycleCoordinator(protocols, drivers)
    const [handle] = await coordinator.activate(compose({ manifests: [manifest], protocols, drivers: drivers.descriptors() }))
    expect(coordinator.publications.list()[0]?.extensions).toEqual([
      expect.objectContaining({ extension: expect.objectContaining({ metadata: expect.objectContaining({ name: 'status' }) }) }),
    ])
    await handle?.deactivate()
  })

  it('aborts the activation scope before invoking driver deactivation', async () => {
    const { protocols, manifest } = fixture()
    const drivers = new ActivationDriverRegistry()
    let signal: AbortSignal | undefined
    let abortedAtDeactivate = false
    drivers.register({
      id: 'example.driver', apiVersion: 'adapter.test/v1alpha1', kind: 'Entrypoint',
      activate({ context }) {
        signal = context.scope.signal
        context.protocols.implement({ apiVersion: 'example.dsh/v1alpha1', kind: 'Service' }, {})
      },
      deactivate() { abortedAtDeactivate = signal?.aborted === true },
    })
    const coordinator = new LifecycleCoordinator(protocols, drivers)
    const [handle] = await coordinator.activate(compose({ manifests: [manifest], protocols, drivers: drivers.descriptors() }))
    await handle?.deactivate('test stop')
    expect(abortedAtDeactivate).toBe(true)
    expect(signal?.reason).toBe('test stop')
  })

  it('rejects registrations after the activation scope has closed', async () => {
    const { protocols, manifest } = fixture()
    const drivers = new ActivationDriverRegistry()
    let scope: import('../src/index.js').CleanupScope | undefined
    drivers.register({
      id: 'example.driver', apiVersion: 'adapter.test/v1alpha1', kind: 'Entrypoint',
      activate({ context }) {
        scope = context.scope
        context.protocols.implement({ apiVersion: 'example.dsh/v1alpha1', kind: 'Service' }, {})
      },
    })
    const coordinator = new LifecycleCoordinator(protocols, drivers)
    const [handle] = await coordinator.activate(compose({ manifests: [manifest], protocols, drivers: drivers.descriptors() }))
    await handle?.deactivate()
    expect(() => scope?.add(() => undefined)).toThrow(/scope is closed/)
  })

  it('continues cleanup and preserves activation and cleanup failures', async () => {
    const { protocols, manifest } = fixture()
    const drivers = new ActivationDriverRegistry()
    const activationFailure = new Error('activation failed')
    const cleanupFailure = new Error('cleanup failed')
    let secondCleanup = false
    drivers.register({
      id: 'example.driver', apiVersion: 'adapter.test/v1alpha1', kind: 'Entrypoint',
      activate({ context }) {
        context.scope.add(() => { throw cleanupFailure })
        context.scope.add(() => { secondCleanup = true })
        throw activationFailure
      },
    })
    const coordinator = new LifecycleCoordinator(protocols, drivers)
    const result = coordinator.activate(compose({ manifests: [manifest], protocols, drivers: drivers.descriptors() }))
    await expect(result).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(AggregateError)
      const failures = (error as AggregateError).errors
      expect(failures[0]).toBe(activationFailure)
      expect(failures[1]).toBeInstanceOf(AggregateError)
      expect((failures[1] as AggregateError).errors).toContain(cleanupFailure)
      return true
    })
    expect(secondCleanup).toBe(true)
  })

  it('isolates state listener failures and keeps lifecycle control moving', async () => {
    const { protocols, manifest } = fixture()
    const drivers = new ActivationDriverRegistry()
    drivers.register({
      id: 'example.driver', apiVersion: 'adapter.test/v1alpha1', kind: 'Entrypoint',
      activate({ context }) { context.protocols.implement({ apiVersion: 'example.dsh/v1alpha1', kind: 'Service' }, {}) },
    })
    const coordinator = new LifecycleCoordinator(protocols, drivers)
    coordinator.onStateChange(() => { throw new Error('observer failed') })
    const [handle] = await coordinator.activate(compose({ manifests: [manifest], protocols, drivers: drivers.descriptors() }))
    expect(handle?.state).toBe('active')
    await handle?.deactivate()
    expect(handle?.state).toBe('inactive')
  })

  it('gives concurrent activations of one facet distinct participant identities', async () => {
    const { protocols, manifest } = fixture()
    const drivers = new ActivationDriverRegistry()
    drivers.register({
      id: 'example.driver', apiVersion: 'adapter.test/v1alpha1', kind: 'Entrypoint',
      activate({ context }) { context.protocols.implement({ apiVersion: 'example.dsh/v1alpha1', kind: 'Service' }, {}) },
    })
    const coordinator = new LifecycleCoordinator(protocols, drivers)
    const plan = compose({ manifests: [manifest], protocols, drivers: drivers.descriptors() })
    const [first] = await coordinator.activate(plan)
    const [second] = await coordinator.activate(plan)
    expect(first?.identity.participantId).not.toBe(second?.identity.participantId)
    expect(first?.identity.generation).toBe(1)
    expect(second?.identity.generation).toBe(2)
    expect(coordinator.publications.list().map(row => row.identity.participantId)).toEqual([
      first?.identity.participantId,
      second?.identity.participantId,
    ])
    await first?.deactivate('replace')
    expect(coordinator.publications.list().map(row => row.identity.participantId)).toEqual([second?.identity.participantId])
    await second?.deactivate()
  })

  it('does not let an older activation cleanup remove a newer generation', async () => {
    const { protocols, manifest } = fixture()
    const drivers = new ActivationDriverRegistry()
    drivers.register({
      id: 'example.driver', apiVersion: 'adapter.test/v1alpha1', kind: 'Entrypoint',
      activate({ context }) { context.protocols.implement({ apiVersion: 'example.dsh/v1alpha1', kind: 'Service' }, {}) },
    })
    const coordinator = new LifecycleCoordinator(protocols, drivers)
    const oldPlan = compose({ manifests: [manifest], protocols, drivers: drivers.descriptors() })
    const newManifest = defineComponentManifest({
      ...manifest,
      metadata: { ...manifest.metadata, version: '1.0.1' },
    })
    const newPlan = compose({ manifests: [newManifest], protocols, drivers: drivers.descriptors() })
    const [oldHandle] = await coordinator.activate(oldPlan)
    const [newHandle] = await coordinator.activate(newPlan)
    await oldHandle?.deactivate('replace')
    expect(coordinator.publications.list().map(row => row.identity.instanceId)).toEqual([newHandle?.identity.instanceId])
    await newHandle?.deactivate()
  })

  it('shares one concurrent deactivation and aggregates driver and scope failures', async () => {
    const { protocols, manifest } = fixture()
    const drivers = new ActivationDriverRegistry()
    const driverFailure = new Error('driver cleanup failed')
    const scopeFailure = new Error('scope cleanup failed')
    drivers.register({
      id: 'example.driver', apiVersion: 'adapter.test/v1alpha1', kind: 'Entrypoint',
      activate({ context }) {
        context.protocols.implement({ apiVersion: 'example.dsh/v1alpha1', kind: 'Service' }, {})
        context.scope.add(() => { throw scopeFailure })
      },
      async deactivate() { throw driverFailure },
    })
    const coordinator = new LifecycleCoordinator(protocols, drivers)
    const [handle] = await coordinator.activate(compose({ manifests: [manifest], protocols, drivers: drivers.descriptors() }))
    const first = handle?.deactivate('stop')
    const second = handle?.deactivate('stop-again')
    expect(second).toBe(first)
    await expect(first).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(AggregateError)
      expect((error as AggregateError).errors).toEqual([driverFailure, expect.any(AggregateError)])
      return true
    })
    expect(handle?.state).toBe('failed')
  })

  it('waits for an already-started disposer and shares repeated cleanup settlement', async () => {
    const { protocols, manifest } = fixture()
    const drivers = new ActivationDriverRegistry()
    let releaseCleanup = (): void => undefined
    const cleanupGate = new Promise<void>((resolve) => { releaseCleanup = resolve })
    let dispose: (() => Promise<void>) | undefined
    let calls = 0
    drivers.register({
      id: 'example.driver', apiVersion: 'adapter.test/v1alpha1', kind: 'Entrypoint',
      activate({ context }) {
        context.protocols.implement({ apiVersion: 'example.dsh/v1alpha1', kind: 'Service' }, {})
        dispose = context.scope.add(async () => {
          calls++
          await cleanupGate
        })
      },
    })
    const coordinator = new LifecycleCoordinator(protocols, drivers)
    const [handle] = await coordinator.activate(compose({ manifests: [manifest], protocols, drivers: drivers.descriptors() }))
    const first = dispose?.()
    const deactivation = handle?.deactivate('test stop')
    expect(calls).toBe(1)
    let settled = false
    void deactivation?.then(() => { settled = true })
    await Promise.resolve()
    expect(settled).toBe(false)
    releaseCleanup()
    await expect(first).resolves.toBeUndefined()
    await expect(deactivation).resolves.toBeUndefined()
    await expect(dispose?.()).resolves.toBeUndefined()
    expect(calls).toBe(1)
  })
})
