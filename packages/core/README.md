# @dsh-std/core

English | [中文](README.zh.md)

The minimal meta-protocol for protocol declarations, definition registration, and negotiation. See the [Core Meta-protocol proposal](../../docs/proposals/core.zh.md).

Core understands only `apiVersion`, `kind`, participants, requirements, supports, protocol definitions, and their agreements. It does not prescribe resources, capabilities, providers, execution planes, locality, endpoints, or plugin lifecycle.

A `ProtocolCatalog` belongs to an evaluator. Each protocol definition explicitly lists accepted API versions, validates requirement/support `spec` values, and owns its negotiation logic. Core neither infers compatibility from a shared major version nor treats an installed definition as a live implementation.

`defineProtocolDeclaration()` validates and freezes the requirements and supports currently published by one participant. Static component bounds belong to `@dsh-std/manifest`, selection to `@dsh-std/composition`, activation and the publication barrier to `@dsh-std/lifecycle`, and cross-endpoint offers to `@dsh-std/connection`.

Provider selection, multi-party merging, catalogs, invocation bindings, and UI semantics remain owned by their protocol definitions or domain packages.

See the [Core design and API guide (Chinese)](../../docs/core-guide.zh.md) for usage examples, interfaces, and internal consumers.

## API entries

| Import | Purpose |
| --- | --- |
| `@dsh-std/core` | Declarations, protocol definitions, catalog registration, and negotiation reports |
| `@dsh-std/core/identity` | Coordinate validation, equality, and index keys |
| `@dsh-std/core/json` | Protocol JSON validation and immutable snapshots |
| `@dsh-std/core/version` | Component package SemVer parsing, comparison, and ranges |

The main entry provides `defineProtocolDeclaration()`, `validateProtocolDeclaration()`, and `ProtocolCatalog`. The catalog provides `register()`, `resolve()`, `understands()`, and `negotiate()`; `register()` returns a function that unregisters its definition.

Participant identity is `{ id }`; evaluator identity is `{ name, version }`. Definition validators receive the declared coordinate as an `ApiReference`. Each negotiation input row pairs a participant with its requirement or support.
