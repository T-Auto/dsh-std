import { afterEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import CommandRuntime from '@deepseek-ai/dsh-commands'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import { KNOWN_SESSION_EVENT_TYPES } from '@deepseek-ai/dsh-session'
import { defineProtocolDeclaration } from '@dsh-std/core'
import { defineComponentManifest } from '@dsh-std/manifest'
import { DshBrowserUiRuntime } from '../src/client.js'
import { StandardEndpointRuntime, resolveConnection, type CapabilityClient } from '@dsh-std/connection'
import {
  notificationClient,
  notificationImplementation,
  notificationSupport,
} from '@dsh-std/presentation'
import {
  contributionHostRequirement,
  contributionHostRequirementV2,
  type UiContributionProvider,
  type ContributionHostApiVersion,
  type ContributionHostClient,
} from '@dsh-std/ui'
import {
  DSH_ACTIVATION_API_VERSION,
  DSH_ACTIVATION_KIND,
  DSH_COMMAND_API_VERSION,
  DSH_COMMAND_RUNTIME_KIND,
  DSH_MODEL_API_VERSION,
  DSH_MODEL_CATALOG_KIND,
  DSH_MODEL_PROVIDER_KIND,
  DSH_PRESENTATION_API_VERSION,
  DSH_SESSION_API_VERSION,
  DSH_TOOL_API_VERSION,
  DshStandardAdapter,
  default as dshStandardAdapterPlugin,
} from '../src/index.js'

interface FixtureTool {
  name: string
  description?: string
  parameters?: unknown
  output?: {
    schema: unknown
    render(args: unknown, value: unknown): unknown[]
    presentationMeta?(args: unknown, value: unknown): unknown
  }
  execute?(args: unknown, exec: unknown): Promise<unknown>
  isConcurrencySafe?(args: unknown): boolean
  timeoutMs?: number
  presentCall?(args: unknown): unknown
  presentResult?(args: unknown, result: unknown): unknown
}

let context: Context | undefined
const temporaryRoots: string[] = []

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function presentation(kinds: readonly string[]) {
  return {
    clientId: 'client-1',
    contracts: kinds.map(kind => ({ apiVersion: DSH_PRESENTATION_API_VERSION, kind })),
  }
}

async function fixture(
  declarePresentation = true,
  profile = 'host',
  commandPlacements?: readonly { readonly apiVersion: string; readonly kind: string }[],
): Promise<{
  ctx: Context
  adapter: DshStandardAdapter
  events: Array<{ type: string; data: unknown }>
  agent: {
    id: string
    options: { provider: string; model: string }
    ctx: {
      tools: { register(definition: FixtureTool): () => void }
      on(name: 'tools/execute', listener: (exec: unknown, next: () => Promise<unknown>) => Promise<unknown>): () => void
      executeTool(exec: unknown, next: () => Promise<unknown>): Promise<unknown>
    }
    session: {
      id: string
      header: { cwd?: string }
      requestHeader(): { config: { provider: string; model: string } }
      deriveMessages(): unknown[]
      append(type: string, data: unknown): unknown
    }
  }
  tools: {
    get(name: string, scope?: object): FixtureTool | undefined
    setGlobal(definition: FixtureTool): void
    register(definition: FixtureTool): () => void
  }
}> {
  const ctx = new Context()
  context = ctx
  const events: Array<{ type: string; data: unknown }> = []
  const globalTools = new Map<string, FixtureTool>()
  const scopedTools = new WeakMap<object, Map<string, FixtureTool>>()
  const toolExecuteListeners = new Set<(exec: unknown, next: () => Promise<unknown>) => Promise<unknown>>()
  const agent = {
    id: 'session-1',
    options: { provider: 'example-provider', model: 'model-test' },
    ctx: {
      tools: {
        register(definition: FixtureTool) {
          const layer = scopedTools.get(agent) ?? new Map()
          if (layer.has(definition.name)) throw new Error(`duplicate scoped tool ${definition.name}`)
          scopedTools.set(agent, layer)
          layer.set(definition.name, definition)
          ctx.emit('tools/change')
          return () => { layer.delete(definition.name); ctx.emit('tools/change') }
        },
      },
      on(name: 'tools/execute', listener: (exec: unknown, next: () => Promise<unknown>) => Promise<unknown>) {
        if (name !== 'tools/execute') throw new Error(`unexpected agent event ${name}`)
        toolExecuteListeners.add(listener)
        return () => { toolExecuteListeners.delete(listener) }
      },
      async executeTool(exec: unknown, next: () => Promise<unknown>) {
        const listeners = [...toolExecuteListeners]
        let index = 0
        const dispatch = async (): Promise<unknown> => {
          const listener = listeners[index++]
          return listener === undefined ? await next() : await listener(exec, dispatch)
        }
        return await dispatch()
      },
    },
    session: {
      id: 'session-1',
      header: {},
      requestHeader: () => ({ config: { provider: agent.options.provider, model: agent.options.model } }),
      deriveMessages: () => [],
      append(type: string, data: unknown) {
        events.push({ type, data })
        return { type, seq: events.length - 1, time: Date.now(), data }
      },
    },
  }
  const tools = {
    get(name: string, scope?: object) {
      return (scope === undefined ? undefined : scopedTools.get(scope)?.get(name)) ?? globalTools.get(name)
    },
    setGlobal(definition: { name: string }) {
      globalTools.set(definition.name, definition)
      ctx.emit('tools/change')
    },
    register(definition: FixtureTool) {
      if (globalTools.has(definition.name)) throw new Error(`duplicate global tool ${definition.name}`)
      globalTools.set(definition.name, definition)
      ctx.emit('tools/change')
      return () => { globalTools.delete(definition.name); ctx.emit('tools/change') }
    },
  }
  ctx.provide('agents', { get: (id: string) => id === 'session-1' ? agent : undefined } as never)
  ;(ctx.get('agents') as unknown as { list?: () => unknown[] }).list = () => [agent]
  ctx.provide('sessionController', {
    list: async () => ({ items: [{ sessionId: 'session-1' }] }),
    inspect: async (id: string) => {
      if (id !== 'session-1') {
        throw Object.assign(new Error('not found'), { failure: { code: 'session/not-found' } })
      }
      return {
        meta: { id: 'session-1', createdAt: 1 },
        events: events.map((event, seq) => ({ ...event, seq, time: seq + 2 })),
      }
    },
    create: async ({ sessionId }: { sessionId?: string }) => ({ sessionId: sessionId ?? 'session-created' }),
    rename: async ({ title }: { title: string }) => ({ title, seq: events.length }),
    follow: async function *() {
      yield { type: 'snapshot' as const, cursor: events.length - 1 }
    },
  } as never)
  ctx.provide('tools', tools as never)
  await ctx.plugin(CommandRuntime)
  await ctx.plugin(SkillRegistry)
  const adapter = new DshStandardAdapter(ctx, { profile })
  const manifest = defineComponentManifest({
    apiVersion: 'manifest.dsh/internal/v1alpha1', kind: 'Component',
    metadata: { name: 'example.acme.account', displayName: 'Account', version: '1.0.0' },
    spec: {
      facets: [{
        name: 'runtime',
        activation: {
          apiVersion: DSH_ACTIVATION_API_VERSION,
          kind: DSH_ACTIVATION_KIND,
          spec: { module: 'acme/account' },
        },
        ...(declarePresentation ? { protocols: { requires: [{
          apiVersion: DSH_PRESENTATION_API_VERSION,
          kind: 'OpenExternal',
          optional: true,
        }] } } : {}),
        extensions: [
          {
            apiVersion: DSH_COMMAND_API_VERSION, kind: 'Command',
            metadata: { name: 'account' },
            spec: {
              title: 'Manage account',
              ...(commandPlacements === undefined ? {} : { placements: commandPlacements }),
              children: [{ name: 'login', spec: { title: 'Sign in' } }],
            },
          },
          {
            apiVersion: DSH_MODEL_API_VERSION, kind: DSH_MODEL_PROVIDER_KIND,
            metadata: { name: 'example-provider' },
            spec: { title: 'Example Provider', actions: { authenticate: { name: 'account', path: ['login'] } } },
          },
        ],
      }],
    },
  })
  await adapter.mount({
    manifest,
    facet: 'runtime',
    activate(activation) {
      activation.extensions.publish(
        { apiVersion: DSH_COMMAND_API_VERSION, kind: 'Command' },
        'account',
        { execute: () => ({ kind: 'success', text: 'copy the URL' }) },
      )
      activation.extensions.publish({ apiVersion: DSH_MODEL_API_VERSION, kind: DSH_MODEL_PROVIDER_KIND }, 'example-provider', {})
    },
    snapshot: () => ({
      extensions: [{
        apiVersion: DSH_MODEL_API_VERSION,
        kind: DSH_MODEL_PROVIDER_KIND,
        name: 'example-provider',
        status: {
          state: 'authentication-required',
          models: [{ id: 'model-test', name: 'Model Test', selectable: false, reason: 'authentication-required' }],
        },
      }],
    }),
  })
  return { ctx, adapter, events, agent, tools }
}

describe('@dsh-std/adapter-dsh', () => {
  it('projects package-local standard Skills lazily and retracts them on unload', async () => {
    const { ctx, adapter } = await fixture()
    const profileDir = mkdtempSync(join(tmpdir(), 'dsh-std-skill-profile-'))
    temporaryRoots.push(profileDir)
    const componentDir = join(profileDir, 'node_modules', 'skill-component')
    const skillDir = join(componentDir, 'skills', 'portable-skill')
    mkdirSync(skillDir, { recursive: true })
    writeFileSync(join(profileDir, 'package.json'), JSON.stringify({
      name: 'fixture-profile', private: true, dependencies: { 'skill-component': '1.0.0' },
    }))
    writeFileSync(join(componentDir, 'package.json'), JSON.stringify({
      name: 'skill-component', version: '1.0.0', type: 'module',
    }))
    writeFileSync(join(componentDir, 'dsh-plugin.json'), JSON.stringify({
      $schema: 'urn:example:dsh-plugin:0.15', manifestVersion: '0.15',
      id: 'example.skill.component', name: 'Skill Component', version: '1.0.0',
      facets: { host: { entry: 'standard.js', apiVersion: 'v1alpha1' } },
      contributes: {
        'x-dsh-std.skills': [{
          id: 'example.skill.component.portable-skill',
          apiVersion: 'skills.dsh/v1alpha1', kind: 'Skill', name: 'portable-skill',
          spec: {
            description: 'Load portable guidance only when requested.',
            entry: 'skills/portable-skill/SKILL.md',
            invocation: { model: true, user: false },
          },
        }],
      },
    }))
    writeFileSync(join(componentDir, 'standard.js'), [
      'export default {',
      '  activate(context) {',
      '    context.extensions.publish({ apiVersion: "skills.dsh/v1alpha1", kind: "Skill" }, "portable-skill", null)',
      '  },',
      '}',
      '',
    ].join('\n'))
    const skillPath = join(skillDir, 'SKILL.md')
    writeFileSync(skillPath, 'initial body')

    const disposers = await adapter.mountProfileComponents(profileDir)
    expect(await ctx.skills.list()).toEqual(expect.arrayContaining([expect.objectContaining({
      name: 'portable-skill',
      description: 'Load portable guidance only when requested.',
      invocation: { modelInvocable: true, userInvocable: false },
      provider: 'dsh-std',
    })]))

    writeFileSync(skillPath, 'body loaded after catalog discovery')
    await expect(ctx.skills.get('portable-skill')).resolves.toEqual(expect.objectContaining({
      name: 'portable-skill', content: 'body loaded after catalog discovery',
    }))

    writeFileSync(skillPath, Uint8Array.of(0xff))
    await expect(ctx.skills.get('portable-skill')).rejects.toThrow()

    for (const dispose of [...disposers].reverse()) await dispose()
    await expect(ctx.skills.get('portable-skill')).resolves.toBeUndefined()
  })

  it('discovers portable facet modules from installed profile dependencies', async () => {
    const { adapter } = await fixture()
    const profileDir = mkdtempSync(join(tmpdir(), 'dsh-std-profile-'))
    temporaryRoots.push(profileDir)
    const componentDir = join(profileDir, 'node_modules', 'fixture-component')
    mkdirSync(componentDir, { recursive: true })
    writeFileSync(join(profileDir, 'package.json'), JSON.stringify({
      name: 'fixture-profile', private: true, dependencies: { 'fixture-component': '1.0.0' },
    }))
    writeFileSync(join(componentDir, 'package.json'), JSON.stringify({
      name: 'fixture-component', version: '1.0.0', type: 'module',
      exports: { './standard': './standard.js', './client': './missing-client.js' },
      dsh: { client: { platform: 'web', inject: [] } },
    }))
    writeFileSync(join(componentDir, 'dsh-plugin.json'), JSON.stringify({
      $schema: 'urn:example:dsh-plugin:0.15',
      manifestVersion: '0.15',
      id: 'example.fixture.component',
      name: 'Fixture Component',
      version: '1.0.0',
      facets: { host: { entry: 'standard.js', apiVersion: 'v1alpha1' } },
      requires: { contracts: [] },
      permissions: [],
      contributes: {
        commands: [],
        'x-dev.dsh-std.extensions': [{
          id: 'example.fixture.component.session-event',
          apiVersion: 'session.dsh/v1alpha1',
          kind: 'SessionEvent',
          name: 'fixture/event',
          spec: { description: 'Fixture event', replay: 'ignorable' },
        }],
      },
      subscriptions: [],
    }))
    writeFileSync(join(componentDir, 'standard.js'), 'export default { activate() {} }\n')

    const disposers = await adapter.mountProfileComponents(profileDir)
    expect((await adapter.snapshot()).facets).toEqual(expect.arrayContaining([
      expect.objectContaining({ identity: expect.objectContaining({
          component: 'example.fixture.component', facet: 'host',
      }) }),
    ]))
    for (const dispose of disposers) await dispose()
    expect((await adapter.snapshot()).facets.some(row => row.identity.component === 'example.fixture.component')).toBe(false)
  })

  it.each(['ui.dsh/v1alpha1', 'ui.dsh/v1alpha2'] as const)('installs a Community LocalModule with exact %s requirements without a product Loader entry', async apiVersion => {
    const { ctx, adapter } = await fixture()
    const routes: Array<{
      path: string
      handler(request: { method?: string; url?: string }, response: {
        writeHead(status: number, headers?: Record<string, string>): void
        end(body?: Uint8Array | string): void
      }): void
    }> = []
    const provide = ctx.provide.bind(ctx) as (name: string, value: unknown) => void
    provide('webServer', {
      register(route: typeof routes[number]) { routes.push(route); return () => { routes.splice(routes.indexOf(route), 1) } },
    })
    const profileDir = mkdtempSync(join(tmpdir(), 'dsh-std-web-profile-'))
    temporaryRoots.push(profileDir)
    const componentDir = join(profileDir, 'node_modules', 'web-component')
    mkdirSync(componentDir, { recursive: true })
    writeFileSync(join(profileDir, 'package.json'), JSON.stringify({
      name: 'fixture-profile', private: true, dependencies: { 'web-component': '1.0.0' },
    }))
    writeFileSync(join(componentDir, 'package.json'), JSON.stringify({
      name: 'web-component', version: '1.0.0', type: 'module',
    }))
    writeFileSync(join(componentDir, 'dsh-plugin.json'), JSON.stringify({
      $schema: 'urn:example:dsh-plugin:0.15', manifestVersion: '0.15',
      id: 'example.web.component', name: 'Web Component', version: '1.0.0',
      facets: { host: { entry: 'standard.js', apiVersion: 'v1alpha1' } },
      requires: { contracts: [] }, permissions: [], contributes: {
        commands: [],
        'x-dev.dsh-std.extensions': [{
          id: 'example.web.component.browser',
          apiVersion: 'browser.ui.dsh/v1alpha1', kind: 'LocalModule', name: 'browser',
          spec: {
            module: 'client.js',
            requirements: [{
              apiVersion, kind: 'ContributionHost',
              spec: { surfaces: [{
                apiVersion: 'browser.ui.dsh/v1alpha1', kind: 'SettingsSection', mode: 'local-module',
              }], ...(apiVersion === 'ui.dsh/v1alpha2' ? { optionalSurfaces: [{
                apiVersion: 'example.ui/v1', kind: 'Missing', mode: 'local-module',
              }] } : {}) },
            }],
          },
        }],
      }, subscriptions: [],
    }))
    writeFileSync(join(componentDir, 'standard.js'), 'export default { activate() {} }\n')
    writeFileSync(join(componentDir, 'client.js'), 'window.__ModuleLoader__.load({ id: "web-component", factory: () => ({ default: { activate() {} } }) });\n')

    const disposers = await adapter.mountProfileComponents(profileDir)
    const facets = adapter.browserFacets()
    expect(facets).toEqual([expect.objectContaining({
      moduleId: 'web-component', facet: 'browser',
      manifest: expect.objectContaining({ metadata: expect.objectContaining({ name: 'example.web.component' }) }),
    })])
    await expect(adapter.components()).resolves.toEqual(expect.arrayContaining([expect.objectContaining({
      id: 'example.web.component', displayName: 'Web Component', version: '1.0.0',
      facets: [expect.objectContaining({ name: 'host', state: 'active' })],
    })]))
    await vi.waitFor(() => { expect(routes).toHaveLength(1) })
    expect(facets[0]!.url).toMatch(/^dsh-std\/browser-modules\/[a-f0-9]{24}\.js\?rev=[a-f0-9]{16}$/u)
    let status = 0
    let body: Uint8Array | string | undefined
    routes[0]!.handler({ method: 'GET', url: new URL(facets[0]!.url, 'http://dsh.invalid/').pathname }, {
      writeHead(value) { status = value },
      end(value) { body = value },
    })
    expect(status).toBe(200)
    expect(Buffer.from(body as Uint8Array).toString('utf8')).toContain('__ModuleLoader__.load')
    const requirement = facets[0]!.manifest.spec.facets[0]!.protocols!.requires![0]!
    expect(requirement.apiVersion).toBe(apiVersion)
    expect(requirement.spec).toEqual({
      surfaces: [{ apiVersion: 'browser.ui.dsh/v1alpha1', kind: 'SettingsSection', mode: 'local-module' }],
      ...(apiVersion === 'ui.dsh/v1alpha2' ? { optionalSurfaces: [{ apiVersion: 'example.ui/v1', kind: 'Missing', mode: 'local-module' }] } : {}),
    })
    const browser = new Context()
    const entries: Record<string, unknown>[] = []
    browser.provide('slots', {
      inject(_name: string, setup: () => () => void) { return setup() },
      register(options: Record<string, unknown>) {
        entries.push(options)
        return () => { entries.splice(entries.indexOf(options), 1) }
      },
    } as never)
    const runtime = new DshBrowserUiRuntime(browser)
    let ui: ContributionHostClient | undefined
    const disposeBrowser = await runtime.mountFacet({
      manifest: facets[0]!.manifest, facet: facets[0]!.facet,
      module: { activate(activation) {
        ui = activation.protocols.client({ apiVersion, kind: 'ContributionHost' })
        expect(ui!.surfaces.map(row => row.kind)).toEqual(['SettingsSection'])
        expect(activation.protocols.client({
          apiVersion: apiVersion === 'ui.dsh/v1alpha1' ? 'ui.dsh/v1alpha2' : 'ui.dsh/v1alpha1', kind: 'ContributionHost',
        })).toBeUndefined()
        expect(() => ui!.register({ descriptor: {
          id: 'missing', surface: { apiVersion: 'example.ui/v1', kind: 'Missing' }, content: {},
        }, localModule: { component: () => null } })).toThrow(/not negotiated/)
        ui!.register({ descriptor: {
          id: 'installed-settings', surface: { apiVersion: 'browser.ui.dsh/v1alpha1', kind: 'SettingsSection' }, content: { label: 'Installed' },
        }, localModule: { component: () => null } })
      } },
    })
    expect(entries).toHaveLength(1)
    await disposeBrowser()
    expect(entries).toEqual([])
    expect(() => ui!.register({ descriptor: {
      id: 'late', surface: { apiVersion: 'browser.ui.dsh/v1alpha1', kind: 'SettingsSection' }, content: { label: 'Late' },
    }, localModule: { component: () => null } })).toThrow(/closed/)
    await browser.fiber.dispose()
    for (const dispose of [...disposers].reverse()) await dispose()
    expect(adapter.browserFacets()).toEqual([])
  })

  it('loads a Community v0.15 host facet from a package-relative entry', async () => {
    const { adapter } = await fixture()
    const profileDir = mkdtempSync(join(tmpdir(), 'dsh-std-community-profile-'))
    temporaryRoots.push(profileDir)
    const componentDir = join(profileDir, 'node_modules', 'community-component')
    mkdirSync(join(componentDir, 'dist'), { recursive: true })
    writeFileSync(join(profileDir, 'package.json'), JSON.stringify({
      name: 'fixture-profile', private: true, dependencies: { 'community-component': '1.0.0' },
    }))
    writeFileSync(join(componentDir, 'package.json'), JSON.stringify({
      name: 'community-component', version: '1.0.0', type: 'module',
    }))
    writeFileSync(join(componentDir, 'dsh-plugin.json'), JSON.stringify({
      $schema: 'urn:example:dsh-plugin:0.15',
      manifestVersion: '0.15',
      id: 'example.community.component',
      name: 'Community Component',
      version: '1.0.0',
      facets: { host: { entry: 'dist/host.js', apiVersion: 'v1alpha1' } },
      requires: { contracts: [{ apiVersion: 'commands.dsh/v1alpha1', kind: 'Command' }] },
      permissions: [],
      contributes: { commands: [{
        id: 'example.community.component.status',
        title: 'Community status',
      }] },
      subscriptions: [],
    }))
    writeFileSync(join(componentDir, 'dist', 'host.js'), `export default {
      activate(context) {
        context.extensions.publish(
          { apiVersion: 'commands.dsh/v1alpha1', kind: 'Command' },
          'example.community.component.status',
          { execute() { return { kind: 'success', text: 'community status' } } },
        )
      },
    }\n`)

    const disposers = await adapter.mountProfileComponents(profileDir)
    expect((await adapter.snapshot()).facets).toEqual(expect.arrayContaining([
      expect.objectContaining({ identity: expect.objectContaining({
        component: 'example.community.component', facet: 'host',
      }) }),
    ]))
    expect(adapter.catalog('session-1', undefined).commands).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'status',
        resource: expect.objectContaining({ metadata: expect.objectContaining({ name: 'status' }) }),
      }),
    ]))
    for (const dispose of disposers) await dispose()
  })

  it('gives a standard facet a callable client for its negotiated protocol', async () => {
    const { adapter } = await fixture(false)
    const notices: string[] = []
    let issuedCapability: CapabilityClient | undefined
    const provider = defineComponentManifest({
      apiVersion: 'manifest.dsh/internal/v1alpha1', kind: 'Component',
      metadata: { name: 'example.presentation.terminal', version: '1.0.0' },
      spec: { facets: [{
        name: 'runtime',
        activation: { apiVersion: DSH_ACTIVATION_API_VERSION, kind: DSH_ACTIVATION_KIND, spec: { module: 'terminal' } },
        protocols: { supports: [notificationSupport] },
      }] },
    })
    await adapter.mount({
      manifest: provider,
      facet: 'runtime',
      activate(activation) {
        activation.protocols.implement(notificationSupport, notificationImplementation(
          activation.identity.participantId,
          {
            notify(request) {
              notices.push(request.text)
              return { status: 'submitted', value: { accepted: true } }
            },
          },
        ))
      },
    })

    const consumer = defineComponentManifest({
      apiVersion: 'manifest.dsh/internal/v1alpha1', kind: 'Component',
      metadata: { name: 'example.presentation.consumer', version: '1.0.0' },
      spec: { facets: [{
        name: 'runtime',
        activation: { apiVersion: DSH_ACTIVATION_API_VERSION, kind: DSH_ACTIVATION_KIND, spec: { module: 'consumer' } },
        protocols: { requires: [notificationSupport] },
      }] },
    })
    const disposeConsumer = await adapter.mount({
      manifest: consumer,
      facet: 'runtime',
      async activate(activation) {
        const capability = activation.protocols.client<CapabilityClient>(notificationSupport)
        if (capability === undefined) throw new Error('Notification client is unavailable')
        issuedCapability = capability
        let request = 0
        const notification = notificationClient(capability, {
          invocationId: activation.identity.instanceId,
          origin: activation.identity.participantId,
          nextRequestId: () => `${activation.identity.instanceId}:${String(++request)}`,
        })
        await expect(notification.notify({ text: 'standard notification' })).resolves.toEqual({
          status: 'submitted', value: { accepted: true },
        })
      },
    })
    expect(notices).toEqual(['standard notification'])
    await disposeConsumer()
    expect(issuedCapability?.binding(notificationSupport)).toBeUndefined()
  })

  /** Write one profile dependency whose host facet publishes a fixture ModelProvider. */
  function writeProfileModelComponent(profileDir: string): void {
    const componentDir = join(profileDir, 'node_modules', 'fixture-component')
    mkdirSync(componentDir, { recursive: true })
    writeFileSync(join(profileDir, 'package.json'), JSON.stringify({
      name: 'fixture-profile', private: true, dependencies: { 'fixture-component': '1.0.0' },
    }))
    writeFileSync(join(componentDir, 'package.json'), JSON.stringify({
      name: 'fixture-component', version: '1.0.0', type: 'module',
      exports: { './standard': './standard.js' },
    }))
    writeFileSync(join(componentDir, 'dsh-plugin.json'), JSON.stringify({
      $schema: 'urn:example:dsh-plugin:0.15',
      manifestVersion: '0.15',
      id: 'example.fixture.from-profile-url',
      name: 'Fixture From Profile URL',
      version: '1.0.0',
      facets: { host: { entry: 'standard.js', apiVersion: 'v1alpha1' } },
      requires: { contracts: [] },
      permissions: [],
      contributes: {
        commands: [],
        'x-dev.dsh-std.extensions': [{
          id: 'example.fixture.from-profile-url.model-provider',
          apiVersion: 'models.dsh/v1alpha1',
          kind: 'ModelProvider',
          name: 'fixture-models',
          spec: { title: 'Fixture Models' },
        }],
      },
      subscriptions: [],
    }))
    writeFileSync(join(componentDir, 'standard.js'), `
export default {
  activate(context) {
    context.extensions.publish(
      { apiVersion: 'models.dsh/v1alpha1', kind: 'ModelProvider' },
      'fixture-models',
      {
        async listModels() { return [{ id: 'fixture-model', name: 'Fixture Model' }] },
        async *stream(request) {
          globalThis.__dshStdFixtureModelRequest = request
          if (globalThis.__dshStdFixtureEchoToolResult === true) {
            globalThis.__dshStdFixtureEchoToolResult = false
            yield { type: 'block-end', index: 0, block: { type: 'tool-result', toolCallId: 'call-1', content: [] } }
          }
        },
      },
    )
  },
}
`)
  }

  it('discovers from the profile directory URL supplied by the DSH bundle', async () => {
    const profileDir = mkdtempSync(join(tmpdir(), 'dsh-std-profile-url-'))
    temporaryRoots.push(profileDir)
    writeProfileModelComponent(profileDir)

    const ctx = new Context()
    // Cordis scopes the plugin context to its package. The bundle evaluates
    // profileBaseUrl in the root profile context before that scope is created.
    ctx.baseUrl = pathToFileURL(`${join(profileDir, 'node_modules', '@dsh-std', 'adapter-dsh')}/`).href
    ctx.provide('agents', { get: () => undefined, list: () => [] } as never)
    ctx.provide('sessionController', {
      list: async () => ({ items: [] }),
      inspect: async () => { throw Object.assign(new Error('not found'), { failure: { code: 'session/not-found' } }) },
      create: async ({ sessionId }: { sessionId?: string }) => ({ sessionId: sessionId ?? 'created' }),
      rename: async ({ title }: { title: string }) => ({ title, seq: 0 }),
      follow: async function *() { yield { type: 'snapshot' as const, cursor: -1 } },
    } as never)
    await ctx.plugin(CommandRuntime)
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(dshStandardAdapterPlugin, { profileBaseUrl: pathToFileURL(`${profileDir}/`).href })
    const adapter = ctx.dshStd
    for (let attempt = 0; attempt < 20 && (await adapter.snapshot()).facets.length === 0; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 5))
    }
    expect((await adapter.snapshot()).facets).toEqual(expect.arrayContaining([
      expect.objectContaining({ identity: expect.objectContaining({
        component: 'example.fixture.from-profile-url', facet: 'host',
      }) }),
    ]))
    expect(ctx.llm.listProviders()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'fixture-models' }),
    ]))
    await ctx.fiber.dispose()
  })

  it('projects tool and developer messages into the standard model request', async () => {
    const profileDir = mkdtempSync(join(tmpdir(), 'dsh-std-model-projection-'))
    temporaryRoots.push(profileDir)
    writeProfileModelComponent(profileDir)

    const ctx = new Context()
    ctx.baseUrl = pathToFileURL(`${join(profileDir, 'node_modules', '@dsh-std', 'adapter-dsh')}/`).href
    ctx.provide('agents', { get: () => undefined, list: () => [] } as never)
    ctx.provide('sessionController', {
      list: async () => ({ items: [] }),
      inspect: async () => { throw Object.assign(new Error('not found'), { failure: { code: 'session/not-found' } }) },
      create: async ({ sessionId }: { sessionId?: string }) => ({ sessionId: sessionId ?? 'created' }),
      rename: async ({ title }: { title: string }) => ({ title, seq: 0 }),
      follow: async function *() { yield { type: 'snapshot' as const, cursor: -1 } },
    } as never)
    await ctx.plugin(CommandRuntime)
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(dshStandardAdapterPlugin, { profileBaseUrl: pathToFileURL(`${profileDir}/`).href })
    const adapter = ctx.dshStd
    for (let attempt = 0; attempt < 20 && (await adapter.snapshot()).facets.length === 0; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 5))
    }
    const request = {
      provider: 'fixture-models',
      model: 'fixture-model',
      messages: [
        {
          role: 'assistant', id: 'message-1', source: { kind: 'model', provider: 'fixture', model: 'fixture-model' },
          content: [{ type: 'tool-call', id: 'call-1', name: 'read', arguments: '{}' }],
        },
        {
          role: 'tool', id: 'message-2', source: { kind: 'tool', callId: 'call-1' },
          toolCallId: 'call-1', isError: true, content: [{ type: 'text', text: 'file body' }],
        },
        {
          role: 'developer', id: 'message-3', source: { kind: 'tool-registry' },
          content: [{ type: 'tool-addition', toolName: 'read' }],
        },
      ],
    } as never
    for await (const _chunk of ctx.llm.stream(request)) { /* drain */ }

    // DSH carries a tool result as its own tool-role message while the standard
    // request has no tool role, and session-local tool changes stay out.
    expect((globalThis as { __dshStdFixtureModelRequest?: { messages: unknown[] } })
      .__dshStdFixtureModelRequest?.messages).toEqual([
      {
        role: 'assistant',
        source: { kind: 'model', provider: 'fixture', model: 'fixture-model' },
        content: [{ type: 'tool-call', id: 'call-1', name: 'read', arguments: '{}' }],
      },
      {
        role: 'user',
        source: { kind: 'tool', callId: 'call-1' },
        content: [{ type: 'tool-result', toolCallId: 'call-1', content: [{ type: 'text', text: 'file body' }], isError: true }],
      },
    ])

    // A handler cannot answer a tool call with a stream block: DSH carries the
    // result in a tool-role message, so the request fails as a model error.
    ;(globalThis as { __dshStdFixtureEchoToolResult?: boolean }).__dshStdFixtureEchoToolResult = true
    const chunks: Array<{ readonly type: string; readonly reason?: unknown }> = []
    for await (const chunk of ctx.llm.stream({
      provider: 'fixture-models', model: 'fixture-model', messages: [],
    } as never)) chunks.push(chunk as { readonly type: string })
    expect(chunks).toEqual([
      expect.objectContaining({
        type: 'finish',
        reason: {
          kind: 'error',
          failure: expect.objectContaining({
            message: 'a standard tool-result block cannot be produced by a model handler',
          }),
        },
      }),
    ])
    await ctx.fiber.dispose()
  })

  it('describes live protocol declarations without exposing a plugin registry', async () => {
    const { adapter } = await fixture()
    expect(adapter.describe()).toMatchObject({
      apiVersion: 'adapter.dsh/v1alpha1',
      runtime: {
        profile: 'host',
        declaration: { participant: { id: 'std.dsh.adapter-dsh/runtime' }, supports: expect.arrayContaining([
          { apiVersion: DSH_COMMAND_API_VERSION, kind: DSH_COMMAND_RUNTIME_KIND },
          { apiVersion: DSH_MODEL_API_VERSION, kind: DSH_MODEL_CATALOG_KIND },
        ]) },
      },
    })
    expect(adapter).not.toHaveProperty('registry')
  })

  it('activates one facet and publishes only its live extensions', async () => {
    const { adapter } = await fixture()
    await expect(adapter.snapshot()).resolves.toMatchObject({
      apiVersion: 'adapter.dsh/snapshot/v1alpha1',
      facets: [{
        identity: { component: 'example.acme.account', facet: 'runtime' },
        state: 'active',
        extensions: [{ kind: DSH_MODEL_PROVIDER_KIND, name: 'example-provider' }],
      }],
    })
    expect(adapter.publications.list()).toHaveLength(2)
  })

  it('rolls staged facts back when activation fails', async () => {
    const { adapter } = await fixture()
    const before = adapter.publications.list().length
    await expect(adapter.mount({
      manifest: defineComponentManifest({
        apiVersion: 'manifest.dsh/internal/v1alpha1', kind: 'Component',
        metadata: { name: 'example.acme.broken', version: '1.0.0' },
        spec: { facets: [{
          name: 'runtime',
          activation: { apiVersion: DSH_ACTIVATION_API_VERSION, kind: DSH_ACTIVATION_KIND, spec: { module: 'broken' } },
          extensions: [{
            apiVersion: DSH_COMMAND_API_VERSION, kind: 'Command',
            metadata: { name: 'broken' }, spec: { title: 'Broken' },
          }],
        }] },
      }),
      facet: 'runtime',
      activate(activation) {
        activation.extensions.publish({ apiVersion: DSH_COMMAND_API_VERSION, kind: 'Command' }, 'broken', {})
        throw new Error('activation failed')
      },
    })).rejects.toThrow('activation failed')
    expect(adapter.publications.list()).toHaveLength(before)
    expect((await adapter.snapshot()).facets).toHaveLength(1)
  })

  it('rejects an extension identity already owned by a live facet', async () => {
    const { adapter } = await fixture()
    await expect(adapter.mount({
      manifest: defineComponentManifest({
        apiVersion: 'manifest.dsh/internal/v1alpha1', kind: 'Component',
        metadata: { name: 'example.acme.duplicate', version: '1.0.0' },
        spec: { facets: [{
          name: 'runtime',
          activation: { apiVersion: DSH_ACTIVATION_API_VERSION, kind: DSH_ACTIVATION_KIND, spec: { module: 'duplicate' } },
          extensions: [{
            apiVersion: DSH_COMMAND_API_VERSION, kind: 'Command',
            metadata: { name: 'account' }, spec: { title: 'Duplicate account' },
          }],
        }] },
      }),
      facet: 'runtime',
      activate() { throw new Error('must not activate') },
    })).rejects.toThrow(/multiple owners/)
    expect((await adapter.snapshot()).facets).toHaveLength(1)
  })

  it('dispatches adapter-owned catalogs through negotiated connection bindings', async () => {
    const { adapter } = await fixture()
    const client = new StandardEndpointRuntime({ id: 'client', instanceId: 'client-1' })
    client.register({ declaration: defineProtocolDeclaration({
      participant: { id: 'client/catalog' },
      requires: [
        { apiVersion: DSH_COMMAND_API_VERSION, kind: DSH_COMMAND_RUNTIME_KIND },
        { apiVersion: DSH_MODEL_API_VERSION, kind: DSH_MODEL_CATALOG_KIND },
      ],
    }) })
    const plan = resolveConnection(client.offer, adapter.connectionEndpoint.offer, {
      connectionId: 'connection-1', revision: 1, protocols: adapter.protocols,
    })
    expect(plan.compatible).toBe(true)
    const signal = new AbortController().signal
    const commandBinding = plan.bindings.find(binding => binding.requirement.kind === DSH_COMMAND_RUNTIME_KIND)!
    await expect(adapter.connectionEndpoint.dispatch({
      connectionId: plan.connectionId, planRevision: plan.revision, invocationId: 'commands-1',
      binding: commandBinding, operation: 'catalog',
      input: { contextId: 'session-1', presentation: presentation(['OpenExternal']) },
      signal, progress: () => undefined,
    })).resolves.toMatchObject({ commands: [{ name: 'account', owner: { component: 'example.acme.account', facet: 'runtime' } }] })
    const modelBinding = plan.bindings.find(binding => binding.requirement.kind === DSH_MODEL_CATALOG_KIND)!
    await expect(adapter.connectionEndpoint.dispatch({
      connectionId: plan.connectionId, planRevision: plan.revision, invocationId: 'models-1',
      binding: modelBinding, operation: 'list', input: {}, signal, progress: () => undefined,
    })).resolves.toMatchObject({ providers: [{
      owner: { component: 'example.acme.account', facet: 'runtime' },
      resource: { metadata: { name: 'example-provider' }, status: { state: 'authentication-required' } },
    }] })
  })

  it('returns command results without deferred presentation operations', async () => {
    const { adapter, events } = await fixture()
    await expect(adapter.execute(
      'session-1', '/account login', presentation(['OpenExternal']), new AbortController().signal,
    )).resolves.toEqual(expect.objectContaining({ result: { kind: 'success', text: 'copy the URL' } }))
    const execution = await adapter.execute(
      'session-1', '/account login', presentation([]), new AbortController().signal,
    )
    expect(execution).not.toHaveProperty('operations')
    expect(events.map(event => event.type)).toEqual(['command/run', 'command/done', 'command/run', 'command/done'])
  })

  it('offers Web clients a presentation-neutral command Remote entry', async () => {
    const { adapter } = await fixture()
    await expect(adapter.command('session-1', '/account login')).resolves.toEqual(expect.objectContaining({
      result: { kind: 'success', text: 'copy the URL' },
    }))
  })

  it('projects commands only through a provider for one of their declared placements', async () => {
    const commandLine = { apiVersion: 'example.tui/v1alpha1', kind: 'CommandLine' } as const
    const commandPalette = { apiVersion: 'example.web/v1alpha1', kind: 'CommandPalette' } as const
    const { adapter, ctx, agent } = await fixture(true, 'web', [commandLine])
    const nativeAgent = agent as unknown as Parameters<typeof ctx.commands.list>[0]
    expect(ctx.commands.list(nativeAgent))
      .not.toEqual(expect.arrayContaining([expect.objectContaining({ name: 'account' })]))
    expect(adapter.catalog('session-1', undefined, commandPalette).commands).toEqual([])
    expect(adapter.catalog('session-1', undefined, commandLine).commands).toEqual([
      expect.objectContaining({ name: 'account' }),
    ])
    await expect(adapter.command('session-1', '/account login')).resolves.toEqual(expect.objectContaining({
      result: { kind: 'success', text: 'copy the URL' },
    }))
    const disposeProvider = adapter.registerCommandSurfaceProvider({
      participantId: 'example.tui/command-line',
      placement: commandLine,
      register(resource, execute) {
        return ctx.commands.register({
          name: resource.metadata.name,
          description: resource.spec.description ?? resource.spec.title,
          input: { hint: 'subcommand' },
          handler: async invocation => {
            const result = await execute(invocation)
            return result.kind === 'success'
              ? { kind: 'success', ...(result.text === undefined ? {} : { text: result.text }), ...(result.sourceEventSeq === undefined ? {} : { sourceEventSeq: result.sourceEventSeq as never }) }
              : { kind: 'error', text: result.text ?? 'command failed' }
          },
        })
      },
    })
    expect(ctx.commands.list(nativeAgent)).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'account' })]))
    disposeProvider()
    expect(ctx.commands.list(nativeAgent))
      .not.toEqual(expect.arrayContaining([expect.objectContaining({ name: 'account' })]))
  })

  it('maps ToolOverride ownership to every live DSH agent tool view', async () => {
    const { adapter, agent, tools } = await fixture()
    const original: FixtureTool = {
      name: 'read_image', description: 'Read an image.', parameters: { type: 'object' },
      output: { schema: { type: 'object' }, render: () => [] },
      execute: async () => ({ path: 'image.png' }),
    }
    tools.setGlobal(original)
    const dispose = await adapter.mount({
      manifest: defineComponentManifest({
        apiVersion: 'manifest.dsh/internal/v1alpha1', kind: 'Component',
        metadata: { name: 'example.acme.image', version: '1.0.0' },
        spec: { facets: [{
          name: 'runtime',
          activation: { apiVersion: DSH_ACTIVATION_API_VERSION, kind: DSH_ACTIVATION_KIND, spec: { module: 'image' } },
          extensions: [{
            apiVersion: DSH_TOOL_API_VERSION, kind: 'ToolOverride',
            metadata: { name: 'enhanced-read-image' },
            spec: { target: 'read_image', description: 'Accept remote images.' },
          }],
        }] },
      }),
      facet: 'runtime',
      activate(activation) {
        activation.extensions.publish(
          { apiVersion: DSH_TOOL_API_VERSION, kind: 'ToolOverride' },
          'enhanced-read-image',
          { resolve: (base: FixtureTool) => ({ ...base, description: 'Read local or remote images.' }) },
        )
      },
    })
    expect(tools.get('read_image', agent)).toMatchObject({
      name: 'read_image', description: 'Read local or remote images.',
    })
    await expect(tools.get('read_image', agent)!.execute!({ file_path: 'image.png' }, {
      signal: new AbortController().signal,
      deferContext: () => undefined,
    } as never)).resolves.toEqual({ data: { path: 'image.png' }, content: [] })
    await dispose()
    expect(tools.get('read_image', agent)).toBe(original)
  })

  it('replaces execution for a matching provider without shadowing its agent-scoped tool definition', async () => {
    const { ctx, adapter, agent, events, tools } = await fixture()
    const presentCall = () => ({ card: 'generic', title: 'search' })
    const presentResult = () => ({ card: 'web', kind: 'search' })
    const original: FixtureTool = {
      name: 'web_search', description: 'Search the selected web provider.', parameters: { type: 'object' },
      output: {
        schema: { type: 'object' }, render: () => [{ type: 'text', text: 'original' }],
        presentationMeta: () => ({ original: true }),
      },
      execute: async () => ({ sources: [], truncated: false }),
      timeoutMs: 60_000,
      presentCall,
      presentResult,
    }
    agent.ctx.tools.register(original)
    const dispose = await adapter.mount({
      manifest: defineComponentManifest({
        apiVersion: 'manifest.dsh/internal/v1alpha1', kind: 'Component',
        metadata: { name: 'example.acme.search', version: '1.0.0' },
        spec: { facets: [{
          name: 'runtime',
          activation: { apiVersion: DSH_ACTIVATION_API_VERSION, kind: DSH_ACTIVATION_KIND, spec: { module: 'search' } },
          extensions: [
            {
              apiVersion: DSH_TOOL_API_VERSION, kind: 'ToolOverride', metadata: { name: 'codex-search' },
              spec: {
                target: 'web_search', providers: ['openai-codex'], executionOnly: true,
                description: 'Use provider-native search.',
              },
            },
            {
              apiVersion: DSH_SESSION_API_VERSION, kind: 'SessionEvent', metadata: { name: 'example/search-request' },
              spec: { description: 'Search request.', replay: 'required' },
            },
          ],
        }] },
      }),
      facet: 'runtime',
      activate(activation) {
        activation.extensions.publish(
          { apiVersion: DSH_TOOL_API_VERSION, kind: 'ToolOverride' }, 'codex-search',
          { resolve: (base: FixtureTool) => ({
            ...base,
            async execute(_input: unknown, host: {
              session?: { id: string; appendEvent(type: string, data: object): void }
            }) {
              host.session?.appendEvent('example/search-request', { query: 'q' })
              return {
                data: { sources: [], truncated: false },
                content: [{ type: 'text', text: 'provider search' }],
                presentation: { sources: [], truncated: false },
              }
            },
          }) },
        )
      },
    })

    expect(tools.get('web_search', agent)).toBe(original)
    agent.options.provider = 'openai-codex'
    ctx.emit('tools/change')
    const visible = tools.get('web_search', agent)!
    expect(visible).toBe(original)
    expect(visible.presentCall).toBe(presentCall)
    expect(visible.presentResult).toBe(presentResult)
    expect(visible.timeoutMs).toBe(60_000)
    let usedOriginal = false
    const value = await agent.ctx.executeTool({
      name: 'web_search', arguments: {}, signal: new AbortController().signal, agent,
      deferContext: () => undefined,
    }, async () => {
      usedOriginal = true
      return { isError: false, value: { sources: [{ title: 'original' }] }, content: [] }
    })
    expect(events).toContainEqual({ type: 'example/search-request', data: { query: 'q' } })
    expect(usedOriginal).toBe(false)
    expect(value).toEqual({
      isError: false,
      value: { sources: [], truncated: false },
      content: [{ type: 'text', text: 'provider search' }],
      meta: { sources: [], truncated: false },
    })
    expect(visible.output?.presentationMeta?.({}, (value as { value: unknown }).value)).toEqual({ original: true })

    agent.options.provider = 'example-provider'
    ctx.emit('tools/change')
    expect(tools.get('web_search', agent)).toBe(original)
    await expect(agent.ctx.executeTool({ name: 'web_search' }, async () => 'original execution')).resolves.toBe('original execution')
    await dispose()
  })

  it('registers and executes an owned Tool with host image, workspace, observation, and deferral facilities', async () => {
    const { ctx, adapter, tools } = await fixture()
    const workspace = mkdtempSync(join(tmpdir(), 'dsh-std-tool-workspace-'))
    temporaryRoots.push(workspace)
    writeFileSync(join(workspace, 'one.png'), new Uint8Array([1, 2, 3]))
    const image = new Uint8Array([1, 2, 3])
    const reference = {
      attachmentId: 'image-1', mediaType: 'image/png', bytes: 3, width: 1, height: 1, name: 'one.png',
    }
    const validated: unknown[] = []
    const writes: unknown[] = []
    const observed: unknown[] = []
    ctx.provide('attachments', {
      imageLimits: {
        maxImageBytes: 1024, maxImagesPerMessage: 5, maxMessageImageBytes: 2048,
        maxImagePixels: 4096, mediaTypes: ['image/png'],
      },
      validateImage: async (input: unknown) => { validated.push(input) },
      saveImage: async () => reference,
      readImage: async () => ({ ref: reference, data: image }),
    } as never)
    ctx.provide('llm', {
      resolveModelInfo: async () => ({ inputModalities: ['text', 'image'] }),
    } as never)
    ctx.provide('sandboxPolicy', {
      resolve: () => ({ mode: 'workspace-write', workspaceRoot: workspace }),
    } as never)
    const versions = new Map<string, object>()
    ctx.provide('fs', {
      sandboxMode: 'workspace-write',
      resolve: async (path: string) => ({ displayPath: path.startsWith(workspace) ? path : join(workspace, path) }),
      stat: async (target: { displayPath: string }) => existsSync(target.displayPath)
        ? { type: 'file', version: versions.get(target.displayPath) ?? (() => {
          const version = {}
          versions.set(target.displayPath, version)
          return version
        })() }
        : undefined,
      readBytes: async () => image,
      fileUrl: (target: { displayPath: string }) => target.displayPath.endsWith('out.png')
        ? new URL('ssh://example/workspace/out.png')
        : pathToFileURL(target.displayPath),
      processPath: (target: { displayPath: string }) => target.displayPath,
      contains: (parent: { displayPath: string }, child: { displayPath: string }) => {
        const path = relative(parent.displayPath, child.displayPath)
        return path === '' || (!path.startsWith('..') && !isAbsolute(path))
      },
      writeBytes: async (...args: unknown[]) => {
        writes.push(args)
        return { operation: 'update', bytes: 3, version: 'version-2' }
      },
    } as never)
    const eventContext = ctx as unknown as { on(name: string, listener: (...args: unknown[]) => unknown): void }
    eventContext.on('fs/write-intent', () => ({ kind: 'createIfAbsent' }))
    eventContext.on('fs/observed', (...args) => { observed.push(args) })

    const dispose = await adapter.mount({
      manifest: defineComponentManifest({
        apiVersion: 'manifest.dsh/internal/v1alpha1', kind: 'Component',
        metadata: { name: 'example.acme.tool', version: '1.0.0' },
        spec: { facets: [{
          name: 'runtime',
          activation: { apiVersion: DSH_ACTIVATION_API_VERSION, kind: DSH_ACTIVATION_KIND, spec: { module: 'tool' } },
          extensions: [{
            apiVersion: DSH_TOOL_API_VERSION, kind: 'Tool', metadata: { name: 'make_image' },
            spec: { title: 'Make image', description: 'Makes an image.' },
          }],
        }] },
      }),
      facet: 'runtime',
      activate(activation) {
        activation.extensions.publish(
          { apiVersion: DSH_TOOL_API_VERSION, kind: 'Tool' },
          'make_image',
          { resolve: () => ({
            name: 'make_image', description: 'Makes an image.',
            parameters: { type: 'object' }, output: { type: 'object' },
            async execute(_input: unknown, host: {
              model?: { inputModalities?: readonly string[] }
              imageLimits?: { mediaTypes: readonly string[] }
              validateImage(input: unknown): Promise<void>
              saveImage(input: unknown): Promise<{ reference: unknown }>
              recentImages(count: number): Promise<readonly unknown[]>
              readWorkspaceFile(path: string, maxBytes: number): Promise<{ data: Uint8Array }>
              writeWorkspaceFile(path: string, data: Uint8Array): Promise<unknown>
              deferContent?(content: readonly unknown[]): void
            }) {
              expect(host.model?.inputModalities).toContain('image')
              expect(host.imageLimits?.mediaTypes).toEqual(['image/png'])
              await host.validateImage({ data: image, mediaType: 'image/png' })
              const stored = await host.saveImage({ data: image, mediaType: 'image/png' })
              expect(await host.recentImages(1)).toHaveLength(1)
              expect((await host.readWorkspaceFile('one.png', 1024)).data).toEqual(image)
              await host.writeWorkspaceFile('out.png', image)
              await host.writeWorkspaceFile('local.png', image)
              const content = [{ type: 'image', reference: stored.reference }] as const
              host.deferContent?.(content)
              return { data: { ok: true }, content }
            },
          }) },
        )
      },
    })

    const definition = tools.get('make_image')
    expect(definition?.execute).toBeTypeOf('function')
    const deferred: unknown[] = []
    const result = await definition!.execute!({}, {
      signal: new AbortController().signal,
      parent: {},
      agent: {
        options: {},
        session: {
          header: { cwd: workspace },
          requestHeader: () => ({ config: { provider: 'example', model: 'vision' } }),
          deriveMessages: () => [{ content: [{ type: 'tool-result', content: [{ type: 'image', attachment: reference }] }] }],
        },
      },
      deferContext: (message: unknown) => { deferred.push(message) },
    } as never)
    expect(result).toMatchObject({ data: { ok: true } })
    expect(validated).toHaveLength(1)
    expect(writes).toHaveLength(1)
    expect((writes[0] as unknown[])[2]).toEqual({ kind: 'createIfAbsent' })
    expect((writes[0] as unknown[])[4]).toMatchObject({ mode: 'workspace-write' })
    expect(new Uint8Array(readFileSync(join(workspace, 'local.png')))).toEqual(image)
    expect(observed).toHaveLength(3)
    expect(deferred).toHaveLength(1)
    expect(definition!.output!.render({}, result)).toEqual([{ type: 'image', attachment: reference }])
    await dispose()
    expect(tools.get('make_image')).toBeUndefined()
  })

  it('keeps mounted SessionEvent resources recognizable after facet unload', async () => {
    const { adapter } = await fixture()
    const type = 'example/acme-event'
    expect(KNOWN_SESSION_EVENT_TYPES.has(type)).toBe(false)
    const dispose = await adapter.mount({
      manifest: defineComponentManifest({
        apiVersion: 'manifest.dsh/internal/v1alpha1', kind: 'Component',
        metadata: { name: 'example.acme.events', version: '1.0.0' },
        spec: { facets: [{
          name: 'runtime',
          activation: { apiVersion: DSH_ACTIVATION_API_VERSION, kind: DSH_ACTIVATION_KIND, spec: { module: 'events' } },
          extensions: [{
            apiVersion: DSH_SESSION_API_VERSION, kind: 'SessionEvent',
            metadata: { name: type },
            spec: { description: 'Example component event.', replay: 'required' },
          }],
        }] },
      }),
      facet: 'runtime',
      activate() {},
    })
    expect(KNOWN_SESSION_EVENT_TYPES.has(type)).toBe(true)
    await dispose()
    expect(KNOWN_SESSION_EVENT_TYPES.has(type)).toBe(true)
  })

  it('validates exact UI provider versions and defaults to V1 only', async () => {
    const { adapter } = await fixture()
    const surface = { apiVersion: 'example.ui/v1', kind: 'Settings' }
    const provider: UiContributionProvider = {
      participantId: 'ui/default',
      support: { surfaces: [{ ...surface, modes: ['host-rendered'] }] },
      register() { return () => undefined },
    }
    for (const apiVersions of [[], ['ui.dsh/unknown'], ['ui.dsh/v1alpha2', 'ui.dsh/v1alpha2']]) {
      expect(() => adapter.registerUiContributionProvider(provider, {
        apiVersions: apiVersions as ContributionHostApiVersion[],
      })).toThrow(/apiVersions/)
    }
    const unregister = adapter.registerUiContributionProvider(provider)
    const activate = vi.fn()
    await expect(adapter.mount({
      manifest: defineComponentManifest({
        apiVersion: 'manifest.dsh/internal/v1alpha1', kind: 'Component',
        metadata: { name: 'example.v2-only', version: '1.0.0' },
        spec: { facets: [{
          name: 'ui',
          activation: { apiVersion: DSH_ACTIVATION_API_VERSION, kind: DSH_ACTIVATION_KIND, spec: { module: 'ui' } },
          protocols: { requires: [contributionHostRequirementV2({ surfaces: [{ ...surface, mode: 'host-rendered' }] })] },
        }] },
      }), facet: 'ui', activate,
    })).rejects.toThrow()
    expect(activate).not.toHaveBeenCalled()
    await unregister()
  })

  it.each([['ui.dsh/v1alpha2'], ['ui.dsh/v1alpha1', 'ui.dsh/v1alpha2']] as const)(
    'isolates exact UI grants and provider cleanup for %j', async (...apiVersions) => {
      const { adapter } = await fixture()
      const surface = { apiVersion: 'example.ui/v1', kind: 'Settings' }
      const extra = { apiVersion: 'example.ui/v1', kind: 'Panel' }
      const missing = { apiVersion: 'example.ui/v1', kind: 'Missing' }
      const disposed: string[] = []
      const unregister = adapter.registerUiContributionProvider({
        participantId: 'ui/versioned',
        support: { surfaces: [surface, extra].map(row => ({ ...row, modes: ['host-rendered'] })) },
        register(_owner, contribution, context) {
          return () => { expect(context.signal.aborted).toBe(true); disposed.push(contribution.descriptor.id) }
        },
      }, { apiVersions })
      let v1: ContributionHostClient | undefined
      let v2: ContributionHostClient | undefined
      const dispose = await adapter.mount({
        manifest: defineComponentManifest({
          apiVersion: 'manifest.dsh/internal/v1alpha1', kind: 'Component',
          metadata: { name: 'example.versioned-ui', version: '1.0.0' },
          spec: { facets: [{
            name: 'ui',
            activation: { apiVersion: DSH_ACTIVATION_API_VERSION, kind: DSH_ACTIVATION_KIND, spec: { module: 'ui' } },
            protocols: { requires: [
              ...(apiVersions.some(version => version === 'ui.dsh/v1alpha1') ? [contributionHostRequirement({ surfaces: [{ ...surface, mode: 'host-rendered' }] })] : []),
              contributionHostRequirementV2({
                surfaces: [{ ...surface, mode: 'host-rendered' }],
                optionalSurfaces: [extra, missing].map(row => ({ ...row, mode: 'host-rendered' })),
              }),
            ] },
          }] },
        }), facet: 'ui',
        activate(activation) {
          // Request V2 first: V1 must not reuse its larger facade.
          v2 = activation.protocols.client({ apiVersion: 'ui.dsh/v1alpha2', kind: 'ContributionHost' })
          v1 = activation.protocols.client({ apiVersion: 'ui.dsh/v1alpha1', kind: 'ContributionHost' })
          expect(v2!.surfaces.map(row => row.kind)).toEqual(['Settings', 'Panel'])
          expect(() => v2!.register({ descriptor: { id: 'missing', surface: missing, content: {} } })).toThrow(/not negotiated/)
          v2!.register({ descriptor: { id: 'same', surface, content: {} } })
          v2!.register({ descriptor: { id: 'extra', surface: extra, content: {} } })
          if (v1 !== undefined) {
            expect(v1).not.toBe(v2)
            expect(v1.surfaces.map(row => row.kind)).toEqual(['Settings'])
            expect(() => v1!.register({ descriptor: { id: 'extra-v1', surface: extra, content: {} } })).toThrow(/not negotiated/)
            expect(() => v1!.register({ descriptor: { id: 'same', surface, content: {} } })).toThrow(/duplicate/)
            v1.register({ descriptor: { id: 'v1', surface, content: {} } })
          }
        },
      })
      await unregister()
      expect(disposed.sort()).toEqual(v1 === undefined ? ['extra', 'same'] : ['extra', 'same', 'v1'])
      expect(() => v2!.register({ descriptor: { id: 'late', surface, content: {} } })).toThrow(/closed/)
      if (v1 !== undefined) expect(() => v1!.register({ descriptor: { id: 'late', surface, content: {} } })).toThrow(/closed/)
      await dispose()
      await unregister()
      expect(disposed).toHaveLength(v1 === undefined ? 2 : 3)
    },
  )

  it.each(['v1-only', 'both'])('does not revive old agreements after same-object provider re-registration (%s)', async mode => {
    const { adapter } = await fixture()
    const surface = { apiVersion: 'example.ui/v1', kind: 'Settings' }
    const extra = { apiVersion: 'example.ui/v1', kind: 'Panel' }
    const registered: string[] = []
    const provider: UiContributionProvider = {
      participantId: 'ui/reused-object',
      support: { surfaces: [surface, extra].map(row => ({ ...row, modes: ['host-rendered'] })) },
      register(_owner, contribution) {
        const id = contribution.descriptor.id
        registered.push(id)
        return () => { registered.splice(registered.indexOf(id), 1) }
      },
    }
    const versions = ['ui.dsh/v1alpha1', 'ui.dsh/v1alpha2'] as const
    const requirements = [
      contributionHostRequirement({ surfaces: [{ ...surface, mode: 'host-rendered' }] }),
      contributionHostRequirementV2({
        surfaces: [{ ...surface, mode: 'host-rendered' }],
        optionalSurfaces: [{ ...extra, mode: 'host-rendered' }],
      }),
    ]
    const manifest = (name: string, requires = requirements) => defineComponentManifest({
      apiVersion: 'manifest.dsh/internal/v1alpha1', kind: 'Component',
      metadata: { name, version: '1.0.0' },
      spec: { facets: [{
        name: 'ui',
        activation: { apiVersion: DSH_ACTIVATION_API_VERSION, kind: DSH_ACTIVATION_KIND, spec: { module: 'ui' } },
        protocols: { requires },
      }] },
    })
    const unregisterOld = adapter.registerUiContributionProvider(provider, { apiVersions: versions })
    let oldV1: ContributionHostClient | undefined
    let lateV2: () => ContributionHostClient | undefined = () => undefined
    const disposeOld = await adapter.mount({
      manifest: manifest('example.old-provider-agreement'), facet: 'ui',
      activate(activation) {
        oldV1 = activation.protocols.client({ apiVersion: 'ui.dsh/v1alpha1', kind: 'ContributionHost' })
        oldV1!.register({ descriptor: { id: 'old', surface, content: {} } })
        lateV2 = () => activation.protocols.client({ apiVersion: 'ui.dsh/v1alpha2', kind: 'ContributionHost' })
      },
    })
    await unregisterOld()
    expect(registered).toEqual([])
    const unregisterNew = mode === 'v1-only' ? adapter.registerUiContributionProvider(provider)
      : adapter.registerUiContributionProvider(provider, { apiVersions: versions })
    try {
      expect(lateV2).toThrow(/unavailable/)
      expect(() => oldV1!.register({ descriptor: { id: 'stale', surface, content: {} } })).toThrow(/closed/)
      await disposeOld()
      await unregisterOld()
      const disposeNew = await adapter.mount({
        manifest: manifest('example.new-provider-agreement', mode === 'v1-only' ? [requirements[0]!] : requirements), facet: 'ui',
        activate(activation) {
          activation.protocols.client<ContributionHostClient>({ apiVersion: 'ui.dsh/v1alpha1', kind: 'ContributionHost' })!
            .register({ descriptor: { id: 'new', surface, content: {} } })
          const v2 = activation.protocols.client<ContributionHostClient>({ apiVersion: 'ui.dsh/v1alpha2', kind: 'ContributionHost' })
          if (mode === 'v1-only') expect(v2).toBeUndefined()
          else v2!.register({ descriptor: { id: 'new-extra', surface: extra, content: {} } })
        },
      })
      expect(registered.sort()).toEqual(mode === 'v1-only' ? ['new'] : ['new', 'new-extra'])
      await disposeNew()
      expect(registered).toEqual([])
    } finally {
      await disposeOld()
      await unregisterNew()
    }
  })

  it('revokes both Host clients immediately while provider cleanup is pending', async () => {
    const { adapter } = await fixture()
    const surface = { apiVersion: 'example.ui/v1', kind: 'Settings' }
    let releaseSlow: () => void = () => undefined
    const slow = new Promise<void>(resolve => { releaseSlow = resolve })
    const disposed: string[] = []
    const unregister = adapter.registerUiContributionProvider({
      participantId: 'ui/pending',
      support: { surfaces: [{ ...surface, modes: ['host-rendered'] }] },
      register(_owner, contribution, context) {
        return async () => {
          expect(context.signal.aborted).toBe(true)
          disposed.push(contribution.descriptor.id)
          if (contribution.descriptor.id === 'slow-v1') await slow
        }
      },
    }, { apiVersions: ['ui.dsh/v1alpha1', 'ui.dsh/v1alpha2'] })
    let v1: ContributionHostClient | undefined
    let v2: ContributionHostClient | undefined
    const dispose = await adapter.mount({
      manifest: defineComponentManifest({
        apiVersion: 'manifest.dsh/internal/v1alpha1', kind: 'Component',
        metadata: { name: 'example.ui-pending', version: '1.0.0' },
        spec: { facets: [{
          name: 'ui',
          activation: { apiVersion: DSH_ACTIVATION_API_VERSION, kind: DSH_ACTIVATION_KIND, spec: { module: 'ui' } },
          protocols: { requires: [
            contributionHostRequirement({ surfaces: [{ ...surface, mode: 'host-rendered' }] }),
            contributionHostRequirementV2({ surfaces: [{ ...surface, mode: 'host-rendered' }] }),
          ] },
        }] },
      }), facet: 'ui',
      activate(activation) {
        v1 = activation.protocols.client({ apiVersion: 'ui.dsh/v1alpha1', kind: 'ContributionHost' })
        v2 = activation.protocols.client({ apiVersion: 'ui.dsh/v1alpha2', kind: 'ContributionHost' })
        v1!.register({ descriptor: { id: 'slow-v1', surface, content: {} } })
        v2!.register({ descriptor: { id: 'fast-v2', surface, content: {} } })
      },
    })
    const closing = unregister()
    try {
      expect(disposed.sort()).toEqual(['fast-v2', 'slow-v1'])
      for (const client of [v1!, v2!]) {
        expect(() => client.register({ descriptor: { id: 'late', surface, content: {} } })).toThrow(/closed/)
      }
    } finally {
      releaseSlow()
      await closing
      await dispose()
    }
    expect(disposed).toHaveLength(2)
  })

  it.each(['provider', 'facet', 'activation'])('drains Host version clients after a failing disposer (%s)', async mode => {
    const { adapter } = await fixture()
    const settings = { apiVersion: 'example.ui/v1', kind: 'Settings' }
    const panel = { apiVersion: 'example.ui/v1', kind: 'Panel' }
    let v1: ContributionHostClient | undefined
    const disposed: string[] = []
    const unregister = adapter.registerUiContributionProvider({
      participantId: 'ui/cleanup',
      support: { surfaces: [settings, panel].map(surface => ({ ...surface, modes: ['host-rendered'] })) },
      register(_owner, contribution) {
        return () => {
          disposed.push(contribution.descriptor.id)
          expect(() => v1!.register({ descriptor: { id: 'late', surface: settings, content: {} } })).toThrow(/closed/)
          if (contribution.descriptor.id === 'panel') throw new Error('provider cleanup failed')
        }
      },
    }, { apiVersions: ['ui.dsh/v1alpha1', 'ui.dsh/v1alpha2'] })
    const mounting = adapter.mount({
      manifest: defineComponentManifest({
        apiVersion: 'manifest.dsh/internal/v1alpha1', kind: 'Component',
        metadata: { name: 'example.ui-cleanup', version: '1.0.0' },
        spec: { facets: [{
          name: 'ui',
          activation: { apiVersion: DSH_ACTIVATION_API_VERSION, kind: DSH_ACTIVATION_KIND, spec: { module: 'ui' } },
          protocols: { requires: [
            contributionHostRequirement({ surfaces: [{ ...settings, mode: 'host-rendered' }] }),
            contributionHostRequirementV2({ surfaces: [{ ...panel, mode: 'host-rendered' }] }),
          ] },
        }] },
      }), facet: 'ui',
      activate(activation) {
        v1 = activation.protocols.client({ apiVersion: 'ui.dsh/v1alpha1', kind: 'ContributionHost' })
        v1!.register({ descriptor: { id: 'settings', surface: settings, content: {} } })
        activation.protocols.client<ContributionHostClient>({ apiVersion: 'ui.dsh/v1alpha2', kind: 'ContributionHost' })!
          .register({ descriptor: { id: 'panel', surface: panel, content: {} } })
        if (mode === 'activation') throw new Error('activation failed')
      },
    })
    if (mode === 'activation') await expect(mounting).rejects.toThrow()
    else {
      const dispose = await mounting
      if (mode === 'provider') {
        await expect(unregister()).rejects.toThrow(/failed to close/)
        await dispose()
      } else await expect(dispose()).rejects.toThrow()
    }
    expect(disposed.sort()).toEqual(['panel', 'settings'])
    await unregister()
  })

  it('maps a negotiated local UI host into an activation-scoped client and retracts its contributions', async () => {
    const { adapter } = await fixture()
    const surface = { apiVersion: 'tui.dsh/v1alpha1', kind: 'SettingsSection' } as const
    const registered: string[] = []
    const disposed: string[] = []
    const unregisterProvider = adapter.registerUiContributionProvider({
      participantId: 'tui/surface-host',
      support: { surfaces: [{ ...surface, modes: ['host-rendered'] }] },
      register(owner, contribution, context) {
        expect(owner.component).toBe('example.acme.ui')
        expect(context.signal.aborted).toBe(false)
        registered.push(contribution.descriptor.id)
        return () => {
          expect(context.signal.aborted).toBe(true)
          disposed.push(contribution.descriptor.id)
        }
      },
    })
    const disposeFacet = await adapter.mount({
      manifest: defineComponentManifest({
        apiVersion: 'manifest.dsh/internal/v1alpha1', kind: 'Component',
        metadata: { name: 'example.acme.ui', version: '1.0.0' },
        spec: { facets: [{
          name: 'tui',
          activation: { apiVersion: DSH_ACTIVATION_API_VERSION, kind: DSH_ACTIVATION_KIND, spec: { module: 'ui' } },
          protocols: { requires: [contributionHostRequirement({
            surfaces: [{ ...surface, mode: 'host-rendered' }],
          })] },
        }] },
      }),
      facet: 'tui',
      activate(activation) {
        const ui = activation.protocols.client<ContributionHostClient>({
          apiVersion: 'ui.dsh/v1alpha1', kind: 'ContributionHost',
        })
        expect(ui).toBeDefined()
        ui!.register({
          descriptor: { id: 'openai-codex', surface, content: { title: 'OpenAI Codex' } },
        })
      },
    })
    expect(registered).toEqual(['openai-codex'])
    await disposeFacet()
    expect(disposed).toEqual(['openai-codex'])
    await unregisterProvider()
  })
})
