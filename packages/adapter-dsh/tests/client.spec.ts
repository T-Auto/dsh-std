import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { defineComponentManifest } from '@dsh-std/manifest'
import { defineFacet } from '@dsh-std/sdk'
import {
  contributionHostRequirement,
  contributionHostRequirementV2,
  type ContributionHostClient,
} from '@dsh-std/ui'
import {
  DshBrowserUiRuntime,
  BROWSER_CLIENT_ACTIVATION_API_VERSION,
  BROWSER_CLIENT_ACTIVATION_KIND,
  BROWSER_SETTINGS_SECTION,
  BROWSER_TOOL_CALL_VIEW,
  browserSettingsSectionRequirement,
  browserToolCallViewRequirement,
  type DshBrowserLocalHost,
} from '../src/client.js'

describe('DSH browser UI adapter', () => {
  it('maps negotiated local UI contributions to live Web slots and retracts them with the facet', async () => {
    const entries: Array<{ name: string; options: Record<string, unknown>; component: unknown }> = []
    const slots = {
      inject(name: string, setup: () => () => void): () => void {
        const dispose = setup()
        return dispose
      },
      register(options: Record<string, unknown>, component: unknown): () => void {
        const entry = { name: String(options.name), options, component }
        entries.push(entry)
        return () => {
          const index = entries.indexOf(entry)
          if (index >= 0) entries.splice(index, 1)
        }
      },
    }
    const ctx = new Context()
    ctx.provide('slots', slots as never)
    const runtime = new DshBrowserUiRuntime(ctx)
    const settingsComponent = (): null => null
    const toolComponent = (): null => null
    const manifest = defineComponentManifest({
      apiVersion: 'manifest.dsh/internal/v1alpha1',
      kind: 'Component',
      metadata: { name: 'example.acme.web', version: '1.0.0' },
      spec: { facets: [{
        name: 'web',
        activation: {
          apiVersion: BROWSER_CLIENT_ACTIVATION_API_VERSION,
          kind: BROWSER_CLIENT_ACTIVATION_KIND,
          spec: { module: './client.js' },
        },
        protocols: { requires: [contributionHostRequirement({ surfaces: [
          browserSettingsSectionRequirement(),
          browserToolCallViewRequirement(),
        ] })] },
      }] },
    })
    const facet = defineFacet(activation => {
      const ui = activation.protocols.client<ContributionHostClient>({
        apiVersion: 'ui.dsh/v1alpha1', kind: 'ContributionHost',
      })
      expect(ui).toBeDefined()
      ui!.register({
        descriptor: {
          id: 'account', surface: BROWSER_SETTINGS_SECTION,
          content: { label: 'Account', order: 15 },
        },
        localModule: { component: settingsComponent },
      })
      ui!.register({
        descriptor: {
          id: 'imagegen', surface: BROWSER_TOOL_CALL_VIEW,
          content: { tool: 'imagegen' },
        },
        localModule: { component: toolComponent },
      })
    })

    const dispose = await runtime.mountFacet({ manifest, facet: 'web', module: facet })
    expect(entries).toEqual([
      expect.objectContaining({
        name: 'settings.section',
        options: expect.objectContaining({ id: 'account', label: 'Account', order: 15 }),
        component: settingsComponent,
      }),
      expect.objectContaining({
        name: 'tool.call.toolview',
        options: expect.objectContaining({ key: 'imagegen' }),
        component: toolComponent,
      }),
    ])
    await dispose()
    expect(entries).toEqual([])
  })

  it.each(['ui.dsh/v1alpha1', 'ui.dsh/v1alpha2'])('preserves empty optional %s agreements without granting a client', async apiVersion => {
    const ctx = new Context()
    ctx.provide('slots', {
      inject() { throw new Error('an unavailable surface must not register') },
      register() { throw new Error('an unavailable surface must not register') },
    } as never)
    const runtime = new DshBrowserUiRuntime(ctx)
    const spec = { surfaces: [{ apiVersion: 'example.ui/v1', kind: 'Missing', mode: 'local-module' as const }] }
    const requirement = apiVersion === 'ui.dsh/v1alpha1'
      ? contributionHostRequirement(spec, true) : contributionHostRequirementV2(spec, true)
    const manifest = defineComponentManifest({
      apiVersion: 'manifest.dsh/internal/v1alpha1', kind: 'Component',
      metadata: { name: 'example.optional-ui', version: '1.0.0' },
      spec: { facets: [{
        name: 'browser',
        activation: { apiVersion: BROWSER_CLIENT_ACTIVATION_API_VERSION, kind: BROWSER_CLIENT_ACTIVATION_KIND, spec: { module: 'client.js' } },
        protocols: { requires: [requirement] },
      }] },
    })
    const dispose = await runtime.mountFacet({ manifest, facet: 'browser', module: defineFacet(activation => {
      const reference = { apiVersion, kind: 'ContributionHost' }
      const negotiated = activation.protocols.agreement(reference)
      expect(negotiated?.agreement).toEqual({ surfaces: [] })
      expect(negotiated?.issues).toEqual(expect.arrayContaining([expect.objectContaining({
        code: 'ui-surface-unavailable', severity: 'warning',
      })]))
      expect(activation.protocols.client(reference)).toBeUndefined()
      expect(activation.protocols.agreement({
        apiVersion: apiVersion === 'ui.dsh/v1alpha1' ? 'ui.dsh/v1alpha2' : 'ui.dsh/v1alpha1', kind: 'ContributionHost',
      })).toBeUndefined()
    }) })
    await dispose()
    await ctx.fiber.dispose()
  })

  it.each(['v1-first', 'v2-first'])('keeps dual-version browser grants and IDs isolated (%s)', async order => {
    const entries: Record<string, unknown>[] = []
    const ctx = new Context()
    ctx.provide('slots', {
      inject(_name: string, setup: () => () => void) { return setup() },
      register(options: Record<string, unknown>) {
        entries.push(options)
        return () => { entries.splice(entries.indexOf(options), 1) }
      },
    } as never)
    const runtime = new DshBrowserUiRuntime(ctx)
    let v1: ContributionHostClient | undefined
    let v2: ContributionHostClient | undefined
    let disposed = 0
    const settings = {
      descriptor: { id: 'account', surface: BROWSER_SETTINGS_SECTION, content: { label: 'Account' } },
      localModule: { component: () => null, dispose() { disposed++ } },
    }
    const tool = {
      descriptor: { id: 'tool', surface: BROWSER_TOOL_CALL_VIEW, content: { tool: 'example' } },
      localModule: { component: () => null, dispose() { disposed++ } },
    }
    const manifest = defineComponentManifest({
      apiVersion: 'manifest.dsh/internal/v1alpha1', kind: 'Component',
      metadata: { name: 'example.browser-versions', version: '1.0.0' },
      spec: { facets: [{
        name: 'browser',
        activation: { apiVersion: BROWSER_CLIENT_ACTIVATION_API_VERSION, kind: BROWSER_CLIENT_ACTIVATION_KIND, spec: { module: 'client.js' } },
        protocols: { requires: [
          contributionHostRequirement({ surfaces: [browserSettingsSectionRequirement()] }),
          contributionHostRequirementV2({ surfaces: [browserSettingsSectionRequirement()], optionalSurfaces: [browserToolCallViewRequirement()] }),
        ] },
      }] },
    })
    const dispose = await runtime.mountFacet({ manifest, facet: 'browser', module: defineFacet(async activation => {
      const client = (apiVersion: string) => activation.protocols.client<ContributionHostClient>({ apiVersion, kind: 'ContributionHost' })
      if (order === 'v1-first') { v1 = client('ui.dsh/v1alpha1'); v2 = client('ui.dsh/v1alpha2') }
      else { v2 = client('ui.dsh/v1alpha2'); v1 = client('ui.dsh/v1alpha1') }
      expect(v1).not.toBe(v2)
      expect(v1!.surfaces.map(row => row.kind)).toEqual(['SettingsSection'])
      expect(v2!.surfaces.map(row => row.kind)).toEqual(['SettingsSection', 'ToolCallView'])
      expect(activation.protocols.agreement({ apiVersion: 'ui.dsh/v1alpha2', kind: 'ContributionHost' })?.apiVersion).toBe('ui.dsh/v1alpha2')
      expect(() => v1!.register(tool)).toThrow(/not negotiated/)
      const lease = v1!.register(settings)
      expect(() => v2!.register(settings)).toThrow(/duplicate/)
      await lease.dispose()
      v2!.register(settings)
      v2!.register(tool)
      v1!.register({ ...settings, descriptor: { ...settings.descriptor, id: 'other' } })
    }) })
    expect(entries).toHaveLength(3)
    await dispose()
    await dispose()
    expect(entries).toEqual([])
    expect(disposed).toBe(4)
    expect(() => v1!.register(settings)).toThrow(/closed/)
    expect(() => v2!.register(settings)).toThrow(/closed/)
    await ctx.fiber.dispose()
  })

  it.each(['unload', 'activation-failure'])('drains both version facades even when a view cleanup fails (%s)', async mode => {
    const entries: string[] = []
    const ctx = new Context()
    ctx.provide('slots', {
      inject(_name: string, setup: () => () => void) { return setup() },
      register(options: Record<string, unknown>) {
        const id = String(options.id ?? options.key)
        entries.push(id)
        return () => { entries.splice(entries.indexOf(id), 1) }
      },
    } as never)
    const runtime = new DshBrowserUiRuntime(ctx)
    const manifest = defineComponentManifest({
      apiVersion: 'manifest.dsh/internal/v1alpha1', kind: 'Component',
      metadata: { name: 'example.browser-cleanup', version: '1.0.0' },
      spec: { facets: [{
        name: 'browser',
        activation: { apiVersion: BROWSER_CLIENT_ACTIVATION_API_VERSION, kind: BROWSER_CLIENT_ACTIVATION_KIND, spec: { module: 'client.js' } },
        protocols: { requires: [
          contributionHostRequirement({ surfaces: [browserSettingsSectionRequirement()] }),
          contributionHostRequirementV2({ surfaces: [browserToolCallViewRequirement()] }),
        ] },
      }] },
    })
    let v1: ContributionHostClient | undefined
    const mounting = runtime.mountFacet({ manifest, facet: 'browser', module: defineFacet(activation => {
      v1 = activation.protocols.client<ContributionHostClient>({ apiVersion: 'ui.dsh/v1alpha1', kind: 'ContributionHost' })
      activation.protocols.client<ContributionHostClient>({ apiVersion: 'ui.dsh/v1alpha1', kind: 'ContributionHost' })!.register({
        descriptor: { id: 'settings', surface: BROWSER_SETTINGS_SECTION, content: { label: 'Settings' } },
        localModule: { component: () => null },
      })
      activation.protocols.client<ContributionHostClient>({ apiVersion: 'ui.dsh/v1alpha2', kind: 'ContributionHost' })!.register({
        descriptor: { id: 'tool', surface: BROWSER_TOOL_CALL_VIEW, content: { tool: 'tool' } },
        localModule: { component: () => null, dispose() {
          expect(() => v1!.register({
            descriptor: { id: 'reentrant', surface: BROWSER_SETTINGS_SECTION, content: { label: 'Late' } },
            localModule: { component: () => null },
          })).toThrow(/closed/)
          throw new Error('view cleanup failed')
        } },
      })
      if (mode === 'activation-failure') throw new Error('activation failed')
    }) })
    if (mode === 'activation-failure') await expect(mounting).rejects.toThrow(/failed to close/)
    else await expect((await mounting)()).rejects.toThrow(/failed to close/)
    expect(entries).toEqual([])
    await ctx.fiber.dispose()
  })

  it('resolves optional locale, command and attachment services only for a requesting contribution', async () => {
    const entries: Array<{ options: Record<string, unknown> }> = []
    const slots = {
      inject(_name: string, setup: () => () => void): () => void { return setup() },
      register(options: Record<string, unknown>): () => void {
        const entry = { options }; entries.push(entry)
        return () => { entries.splice(entries.indexOf(entry), 1) }
      },
    }
    let localeDisposed = false
    const ctx = new Context()
    ctx.provide('slots', slots as never)
    ctx.provide('locale', {
      register: () => () => { localeDisposed = true },
      bind: () => (key: string) => `translated:${key}`,
    } as never)
    const commandRemote = { command: async () => ({
      ok: true,
      value: {
        apiVersion: 'commands.dsh/v1alpha1',
        commandId: 'account.refresh',
        result: { kind: 'success', text: 'done' },
      },
    } as const) }
    ctx.provide('remote', { dshStd: commandRemote } as never)
    ctx.provide('sessions', { binding: () => ({ session: { readAttachment: async () => ({
      ok: true, value: { attachment: { mediaType: 'image/png', name: 'output.png' }, data: [1, 2, 3] },
    }) } }) } as never)
    const runtime = new DshBrowserUiRuntime(ctx, commandRemote)
    let host: DshBrowserLocalHost | undefined
    const manifest = defineComponentManifest({
      apiVersion: 'manifest.dsh/internal/v1alpha1', kind: 'Component',
      metadata: { name: 'example.acme.web-services', version: '1.0.0' },
      spec: { facets: [{
        name: 'web',
        activation: { apiVersion: BROWSER_CLIENT_ACTIVATION_API_VERSION, kind: BROWSER_CLIENT_ACTIVATION_KIND, spec: { module: './client.js' } },
        protocols: { requires: [contributionHostRequirement({ surfaces: [browserSettingsSectionRequirement()] })] },
      }] },
    })
    const facet = defineFacet(activation => {
      activation.protocols.client<ContributionHostClient>({ apiVersion: 'ui.dsh/v1alpha1', kind: 'ContributionHost' })!.register({
        descriptor: { id: 'account', surface: BROWSER_SETTINGS_SECTION, content: { label: 'Account' } },
        localModule: {
          component: () => null,
          setup(value: DshBrowserLocalHost) {
            host = value
            const locale = value.locale('account', { en: { title: 'Account' } })
            return { label: () => locale.t('title'), dispose: locale.dispose }
          },
        },
      })
    })
    const dispose = await runtime.mountFacet({ manifest, facet: 'web', module: facet })
    expect((entries[0]!.options.label as () => string)()).toBe('translated:title')
    await expect(host!.executeCommand('session-1', '/account')).resolves.toEqual({ kind: 'success', text: 'done' })
    await expect(host!.readAttachment('session-1', 'attachment-1')).resolves.toEqual({
      mediaType: 'image/png', name: 'output.png', data: Uint8Array.from([1, 2, 3]),
    })
    await dispose()
    expect(localeDisposed).toBe(true)
    expect(entries).toEqual([])
  })
})
