# Changelog

## Unreleased

- Updated core utility imports to the grouped public entry points.
- Fixed withdrawn Host UI provider agreements reviving when the same provider object is re-registered, including a downgrade to V1-only support; authority now remains scoped to the original registration.
- Added opt-in exact `ui.dsh/v1alpha2` Host provider support while retaining the V1 default, with version-isolated activation clients, owner-local contribution IDs, and full provider/facet cleanup.
- Published both exact ContributionHost versions in the independent browser runtime and preserved V2 optional-surface requirements through the Community v0.15 LocalModule installation bridge, with authorization and unload regressions.
- Adapted lifecycle activation identities to carry a required generation while projecting UI contribution owners through the existing UI owner schema.

## 0.1.1-rc.4

- Adapted the Host and browser integration to DeepSeek Harness `0.2.0-rc.2`. Peer ranges declare the `0.1.5-rc.2` and `0.2.0-rc.2` lines, the `0.1.2` line is no longer declared, and development pins follow `0.2.0-rc.2`.
- Published strict Typert codecs that carry both the `0.1.5` line's `schema` and the `0.1.7`+ line's `create()` factory, so one artifact loads on every supported line.
- Projected DSH `tool`-role messages into standard `tool-result` blocks on a user message and kept session-local `developer` messages out of the standard request, matching the DSH message model. A model handler that returns a `tool-result` block is rejected instead of producing a product message.
- Declared the adapter's own message source kind for deferred tool content, replacing the removed shared `plugin` source kind.
- Contained ToolOverride synchronization failures inside the serial `agent/created` dispatch, so a broken override no longer aborts agent creation, and reported the failure through the Cordis logger.
- Published a document-relative browser module reference while the registered route key stays absolute, so plugin modules load under a mounted deployment as well as at the origin root.
- Stopped publishing an incomparable `cached` Session projection watermark as a Session revision; those summaries fall back to inspection.
- Removed the `0.1.2` Session compatibility paths: the legacy `seedLength` lineage cut and the pre-namespace not-found code.

## 0.1.1-rc.3

- Added the built-in DSH Skill provider projection for `skills.dsh/v1alpha1` resources, with package-contained lazy body reads and activation-owned catalog invalidation.
- Fixed `SessionCatalog.create` retries overwriting later title edits. Create receipts preserve the existing request-to-session mapping, reject changed input, and recover incomplete native operations without rewriting an existing title.
- Adapted the Host and browser integration to DeepSeek Harness `0.1.5-rc.2`, including generic-file-aware model dispatch, branded command event positions, and awaitable browser facet cleanup, while retaining the previous `0.1.2` peer line and Session-summary fallback.
- Made Session catalog listing body-free through DSH projection summaries, restored exact fork lineage through `inheritedEventCount`, and isolated create idempotency by consumer endpoint instance and participant.
- Reported the actual adapter package version in runtime publication and protocol evaluator provenance instead of the stale `0.1.0` placeholder.

## 0.1.1-rc.2

- Adapted the Host and browser integration to the DeepSeek Harness `0.1.2-alpha.2` API split, replacing the removed client-runtime dependency with API Gateway and Session Controller services and recognizing namespaced Remote error codes.
- Published DSH Sessions through standard `SessionCatalog` list/get/create/rename and `SessionHistory` read/follow capabilities, with stable catalog pages and gap-free history follow.
- Preserved component-declared SessionEvent replay classification while treating product-native DSH events as portable-but-ignorable implementation details.

## 0.1.1-rc.1

- Discover browser `LocalModule` facets from standard manifests and project them through the adapter-owned DSH client module and Cordis lifecycle, without requiring a component root Loader entry.
- Project active standard components into a dedicated DSH Web plugin-settings tab instead of representing them as fake Cordis Loader entries.

Changes to `@dsh-std/adapter-dsh` are recorded here.

## 0.1.0-rc3

- Published compatible ranges for internal `@dsh-std` dependencies, including the updated Model and Command releases.

## 0.1.0-rc2

- Replaced the Web-only, profile-gated client mapping with a capability-gated DSH browser-client adapter.
- Added product-owned command surface providers so standard commands are projected only onto declared placement coordinates.
- Kept browser component discovery pending until the native client-module host becomes available.
- Moved the optional browser-realm surface ABI to `@dsh-std/ui-browser`; portable components no longer import the DSH adapter client entrypoint.
- Exported `package.json` so DSH client-module discovery can include the adapter's browser entry.
- Added the strict Host-side Typert artifact and browser Remote used by standard UI facets to execute negotiated commands.

## 0.1.0-rc1

- Added DeepSeek Harness bootstrap, manifest discovery, facet activation, and standard participant publication.
- Added DSH mappings for commands, models, tools, sessions, presentation, workspace, and connection.
- Added host-owned binary and workspace file facilities while preserving DSH policy and approval boundaries.
- Added a Web-only `dsh.client` adapter that maps negotiated local UI facets to native settings and tool-view slots, with profile gating and activation-owned cleanup.
- Aligned the adapter's DSH development baseline with `0.1.0-rc.7` for agent, command, LLM, and session type identity.
