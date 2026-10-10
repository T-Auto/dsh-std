# @dsh-std/composition

Component composition and activation planning for std's internal modules. Callers supply component declarations, activation drivers, a protocol catalog, current supports and extensions, selection policies, and protocol composition rules. The package returns selected facets, protocol bindings, activation order, and composition issues.

See the [composition component design (Chinese)](../../docs/proposals/composition.zh.md) for the overall design. This README describes the implementation and interfaces.

## Implementation layout

| File | Contents |
| --- | --- |
| [`src/index.ts`](src/index.ts) | Input and plan types, rule catalog, component normalization, facet selection, protocol and extension checks, and topological sorting |
| [`tests/composition.spec.ts`](tests/composition.spec.ts) | Tests for component deduplication, driver selection, protocol bindings, permissions, extension conflicts, and ordering |

The package depends on `@dsh-std/manifest` and `@dsh-std/core`. Manifest supplies component structure validation and facet identity helpers. Core supplies the protocol catalog, coordinate matching, and version range checks.

## Interfaces and inputs

`compose(input, rules?)` synchronously returns a `CompositionPlan`. Its `CompositionInput` contains:

| Field | Contents | Required |
| --- | --- | --- |
| `manifests` | Internal component declaration array | Yes |
| `drivers` | Activation driver descriptor array; each entry has `id`, `apiVersion`, and `kind` | Yes |
| `protocols` | Core's `ProtocolCatalog` | Yes |
| `liveDeclarations` | Existing participant declarations supplying support candidates | No |
| `liveExtensions` | Existing extensions and their facet owners | No |
| `select` | Component and facet names selected for this call, with an optional `required` flag | No |
| `policy` | Driver selection and permission decision callbacks | No |

The second argument is a `CompositionRuleCatalog`. When omitted, the call uses an empty rule catalog.

## Component normalization and facet selection

The implementation calls `defineComponentManifest()` to validate, copy, and freeze each declaration, then serializes it with sorted object keys. Declarations with identical serialized content collapse into one. Remaining declarations are sorted by component name, version string, and serialized content.

Duplicate component names after deduplication produce `component-id-conflict`. Relationships are checked against the entire input component set:

| Relationship | Result |
| --- | --- |
| `depends` | A missing target or version mismatch produces an error |
| `recommends` | A missing target or version mismatch produces a warning |
| `breaks` | A target with a matching version produces an error |
| `conflicts` | A target with a matching version produces a warning |

Each component's facets are visited by name. Omitting `select` puts every facet through selection. Supplying it limits selection to listed facets; other facets receive `not-requested`.

Facets with activation declarations match drivers by exact `apiVersion + kind`. A single match is selected directly. Multiple matches are passed to `policy.selectActivationDriver(identity, activation, candidates)`, which returns the selected driver ID.

A missing or unresolved driver selection produces an `activation-unavailable` skipped facet. A selector with `required: true` also produces an error. Facets without activation declarations can be selected as declaration entries.

When the caller provides a permission callback, the implementation calls `policy.authorizePermission(identity, permission)` for each request of a selected facet. Returning `false` produces a warning for an optional permission and an error for a required permission. Omitting the callback or returning another result continues processing.

## Protocol composition rules

`CompositionRuleCatalog` stores rules in a `Map` keyed by `apiVersion + kind`.

| Interface | Purpose |
| --- | --- |
| `register(rule)` | Registers a rule and returns a function that removes that registration; duplicate coordinates throw an error |
| `resolve(reference)` | Returns a rule by coordinate, or `undefined` if none matches |

A `ProtocolCompositionRule` contains its coordinates and two methods:

- `preflight(input)`: receives requirement and support candidates, returning an issue array or an object with `issues` and `bindings`.
- `composeExtensions(input)`: optional; receives a group of extensions and their owners, returning an issue array.

Issues returned by rules contain `code`, `severity`, `message`, and an optional `path`. Composition adds the relevant component information.

## Protocol candidates and bindings

Selected facets' `requires` become `ProtocolRequirementCandidate` entries. Their `supports`, together with existing declarations' `supports`, become `ProtocolSupportCandidate` entries. Candidate IDs are derived from ownership, protocol coordinates, and declaration indexes.

The implementation uses `protocols.resolve()` to find each requirement's definition and gathers supports resolving to that same definition. Unknown requirement definitions or missing support candidates produce errors for required requirements and warnings for optional ones.

Each requirement group looks up a rule by its protocol definition's coordinates. When a rule exists, `preflight()` is called. The basic checks establish definition and support candidate availability; rules perform additional content checks and create bindings.

A `ProtocolBinding` contains one `requirementId` and an array of `supportIds`. The implementation checks that the IDs belong to the current rule input, that the requirement is not bound twice, and that support IDs within a binding are unique. Valid bindings enter the plan; invalid references produce `protocol-binding-invalid`.

## Extension checks and activation order

Existing extensions and selected facets' extensions are collected into one list and grouped by exact coordinate. When `composeExtensions()` exists, its returned issues are used. The basic check reports duplicate extension names within a group as `extension-conflict`.

The activation graph uses selected facet identity strings as nodes, with two kinds of edges:

- Component `depends` relationships: every selected facet of the dependency points to every selected facet of the dependent component.
- Protocol bindings: a planned support provider points to its consumer. Supports from existing participants participate as environment information.

Topological sorting uses indegrees and a ready queue. At each step, the node with the smallest identity string in the ready queue is processed. A cycle produces `dependency-cycle`; `activationOrder` retains the nodes already ordered.

## Plan and results

| Field | Contents |
| --- | --- |
| `apiVersion` | `composition.dsh/v1alpha1` |
| `selected` | Facet identity, component declaration, facet, driver, and planned participant ID recorded during selection |
| `skipped` | Skipped facet identity, category, and reason |
| `bindings` | Rule-produced bindings that passed reference checks; the current implementation always returns this array |
| `activationOrder` | Activation order expressed as facet identity strings |
| `extensions` | Existing and selected facets' extensions and their owners |
| `issues` | Category, severity, relevant components, message, and optional field path |
| `compatible` | `true` when `issues` contains no `error` |
| `revision` | A 32-bit FNV-1a digest of component declarations, selected facet IDs, existing protocol declarations, and bindings |

Planned participant IDs use `component@version#facet`. For `revision`, the data above is serialized with sorted object keys and preserved array order. The digest uses the `fnv1a32:` prefix.

Component structure errors and exceptions thrown by rule or policy callbacks propagate to the caller. Composition check results are collected in `issues`. Selected entries retain the selection stage's results; `compatible` summarizes checks for the whole plan. The returned plan object and result arrays are frozen.

## Downstream integration

Adapters call `compose()`, read the plan and issues, and pass compatible plans to lifecycle. Lifecycle uses `selected` and `activationOrder` to locate drivers and activate facets. During activation it calls core to negotiate actual protocol declarations and manages instance and registration lifetimes.
