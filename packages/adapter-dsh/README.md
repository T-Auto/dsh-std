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

This package is a DSH profile bundle activated by `cordis.patch.yml`. The adapter scans the active profile's dependencies for Community v0.15 `dsh-plugin.json`, validates component declarations, and loads facet entrypoints.

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
