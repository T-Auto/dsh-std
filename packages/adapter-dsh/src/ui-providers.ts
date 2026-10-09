import type { UiContributionProvider } from '@dsh-std/ui'

/** Share owner-local IDs across the exact-version facades of one activation. */
export function activationUiProviders(
  providers: readonly UiContributionProvider[],
  isActive: (provider: UiContributionProvider) => boolean,
): readonly UiContributionProvider[] {
  const keys = new Set<string>()
  return providers.map(provider => ({
    participantId: provider.participantId,
    support: provider.support,
    register(owner, contribution, context) {
      if (!isActive(provider)) throw new Error('UI ContributionHost activation scope is closed')
      const { surface, id } = contribution.descriptor
      const key = JSON.stringify([surface.apiVersion, surface.kind, id])
      if (keys.has(key)) throw new Error(`duplicate UI contribution id ${JSON.stringify(id)} for ${surface.apiVersion} ${surface.kind}`)
      keys.add(key)
      try {
        const dispose = provider.register(owner, contribution, context)
        if (typeof dispose !== 'function') throw new TypeError('UI contribution provider.register must return a disposer')
        return async () => {
          try { await dispose() } finally { keys.delete(key) }
        }
      } catch (error) {
        keys.delete(key)
        throw error
      }
    },
  }))
}
