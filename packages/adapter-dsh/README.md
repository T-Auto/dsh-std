# @dsh-std/adapter-dsh

English | [中文](README.zh.md)

The DeepSeek Harness product adapter, connecting standard components to DSH commands, tools, models, sessions, and browser UI.

This package provides an adapter compatible with this project for integrators to use.

## Installation

Install the adapter and standard components in the same profile:

```sh
dsh plugin --profile web add @dsh-std/adapter-dsh
dsh plugin --profile web add <standard-component>
```

## How it runs

This package is a DSH profile bundle activated by `cordis.patch.yml`. The adapter scans the active profile's dependencies for Community v0.15 `dsh-plugin.json`, checks the Host API, and validates and preflights static declarations before importing each host facet entrypoint. Unknown required contracts or required contracts without live support reject the facet without evaluating its module; missing optional contracts do not block loading. Merely installed providers are not live capabilities.

After import, `mount()` repeats the checks against current live publications before activation. Preflight covers manifest-readable requirements, not requirements discoverable only by executing dynamic code, and does not replace runtime negotiation or rollback.

`DshStandardAdapter` coordinates protocol negotiation and activation, supplies the APIs components need, and connects their published capabilities to product services. The host side requires the `sessionController` service.

To publish built-in host capabilities first, start the adapter with `discover: false`, then load `@dsh-std/adapter-dsh/profile-loader` for component discovery and activation. Integrators can also call `mount()` directly with a declaration, facet name, and activation function.

## Capabilities

| Capability | Integration |
| --- | --- |
| Commands | Provides the catalog and `CommandRuntime`; a product UI registers a provider for a placement to expose matching commands in its native command entrypoint |
| Models | Connects model handlers to the DSH LLM registry and provides `ModelCatalog` |
| Tools | Connects `Tool` and `ToolOverride` to Agent tool execution |
| Skills | Uses the native Skill provider registry and reads package-local Markdown on demand |
| Sessions | Provides SessionCatalog list/get/create/rename and SessionHistory read/follow |
| Browser UI | Loads standard browser modules and provides SettingsSection and ToolCallView surfaces |

Tools execute locally in DSH, using the product's model, attachment, filesystem access, write-intent, sandbox, and nested-context facilities.

The browser half reads `LocalModule` declarations, serves package-local artifacts, and connects them to native UI slots. UI registrations are removed when their facet stops. The DSH Plugins page displays standard components and their runtime state.

## UI ContributionHost versions

Host integrations call `registerUiContributionProvider(provider)` to advertise only `ui.dsh/v1alpha1`, preserving the existing default. To opt in, pass `{ apiVersions: ['ui.dsh/v1alpha2'] }` or `{ apiVersions: ['ui.dsh/v1alpha1', 'ui.dsh/v1alpha2'] }` as the second argument. Empty lists, unknown versions, and duplicate versions are rejected. Support describes the provider's actual surfaces; V1 support does not satisfy a V2 requirement. Re-registering the same provider object or participant after withdrawal never revives earlier agreements; consumers need a new activation to negotiate with the new registration.

The independent browser runtime advertises both exact ContributionHost versions for its SettingsSection and ToolCallView surfaces. For each declared version with granted surfaces, a facet receives a separate client containing only that version's negotiated grants. A wholly optional requirement with no available surfaces retains its queryable agreement and warnings but grants no client. V2 requires at least one required surface; unavailable `optionalSurfaces` produce negotiation warnings and are omitted from the client. Omitted or undeclared surfaces cannot be registered. A contribution ID remains unique within an activation and surface even when both versions are used; disposing its lease releases the ID. Facet failure/unload and Host provider withdrawal close the affected clients and retract their registrations, including all version facades.

Community v0.15 browser facets use the existing namespaced `contributes['x-dev.dsh-std.extensions']` lane, not root-level `requires` or `panels`:

```json
{
  "id": "example.settings.browser",
  "apiVersion": "browser.ui.dsh/v1alpha1",
  "kind": "LocalModule",
  "name": "browser",
  "spec": {
    "module": "dist/client.js",
    "requirements": [{
      "apiVersion": "ui.dsh/v1alpha2",
      "kind": "ContributionHost",
      "spec": {
        "surfaces": [{ "apiVersion": "browser.ui.dsh/v1alpha1", "kind": "SettingsSection", "mode": "local-module" }],
        "optionalSurfaces": [{ "apiVersion": "browser.ui.dsh/v1alpha1", "kind": "ToolCallView", "mode": "local-module" }]
      }
    }]
  }
}
```

Discovery preserves these browser-only requirements through manifest projection and module transport. The module uses `context.protocols.client({ apiVersion: 'ui.dsh/v1alpha2', kind: 'ContributionHost' })` and checks the returned client's surfaces before registering an optional view. The LocalModule ABI itself remains `browser.ui.dsh/v1alpha1`; this does not introduce a TUI module ABI or grant unrelated domain APIs.

## Publication and cleanup

During activation, components register protocol implementations with `context.protocols.implement()` and extension handlers with `context.extensions.publish()`. Capabilities become callable after activation, validation, and negotiation succeed.

Registrations belong to the current activation instance. On activation failure, unmount, or shutdown, the adapter removes that instance's capabilities, product registrations, and connection declarations.

## Session creation requests

`SessionCatalog.create` stores the initial input and completed result for each request ID. Retries within the adapter instance return the original result while preserving later renames; changed input under the same ID returns an error. Callers should use globally unique request IDs.

Request records live in the adapter instance. After the adapter is recreated, a repeated request that identifies an existing session returns its current state and preserves its title.

## Documentation

- [Adapter design](../../docs/proposals/adapter-dsh.zh.md): its purpose and place in std.
- [This adapter's implementation](../../docs/proposals/adapter-dsh-reference.zh.md): loading, activation, product integration, and shutdown.
- [Interfaces for std integration](../../docs/proposals/adapter-std-interfaces.zh.md): interfaces to implement when adapting your own code.
