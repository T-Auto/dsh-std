# @dsh-std/manifest

Component declarations and validation tools for std's internal modules. Callers provide component information, activation and extension validation rules, and an optional protocol catalog. This package prepares declarations, checks their content, and returns shared component objects and validation reports for composition, lifecycle, and adapters.

See the [manifest component design (Chinese)](../../docs/proposals/manifest.zh.md) for the overall design. This README describes the package's implementation and interfaces.

## Implementation layout

| File | Contents |
| --- | --- |
| [`src/index.ts`](src/index.ts) | Types, package manifest parsing and conversion, component structure validation, rule catalogs, and report generation |
| [`schema/dsh-plugin-0.15.schema.json`](schema/dsh-plugin-0.15.schema.json) | JSON Schema for the v0.15 package manifest format |
| [`tests/manifest.spec.ts`](tests/manifest.spec.ts) | Tests for parsing, normalization, model conversion, and validation behavior |

The package's runtime dependency is `@dsh-std/core`. Core utilities check protocol coordinates, JSON data, semantic versions, and version ranges. This package's validation functions check component and package manifest fields. The JSON Schema is exported as a separate file for external tools.

## Data models

The implementation uses two kinds of description objects:

- `PluginManifestInput` and `PluginManifest`: the former represents a v0.15 package manifest awaiting validation; the latter contains the normalized result with empty containers supplied.
- `ComponentManifest`: the component declaration consumed by std's internal modules, identified by `manifest.dsh/internal/v1alpha1 Component`.

An internal component stores its name, version, and display name in `metadata`, and its parts in `spec.facets`. Each facet has a name and can describe activation settings in `activation`, protocol requirements and supports in `protocols`, feature declarations in `extensions`, and permission requests in `permissions`. Component relationships reside in `spec.relationships`.

Callers can construct internal component objects directly or parse package manifests and convert them into the internal model.

## Validating internal components

### Structure validation

| Interface | Usage and result |
| --- | --- |
| `validateComponentManifest(value)` | Checks unknown input against the component structure; returns normally on success |
| `defineComponentManifest(manifest)` | Checks the component structure, then returns a recursively frozen copy |

Structure validation checks component coordinates, fields, names, semantic versions, facet name uniqueness, JSON structure of declaration parameters, and component relationship names and version ranges.

Duplicates are checked within their respective scopes: requirements and supports separately by coordinate, extensions by coordinate and name, and permission requests by coordinate and action. Structure errors throw `TypeError` with the field location and reason.

### Registering content validation rules

Callers create a `ManifestDefinitionCatalog` and register activation and extension rules. The catalog uses two `Map` instances, one for each rule category, keyed by `apiVersion + kind`.

Rules use `ManifestObjectDefinition`, which contains protocol coordinates, a required `validateSpec()` method, and an optional `validateMetadata()` method. Activation rules check startup parameters. Extension rules check configuration and can also check names and labels.

| Catalog interface | Purpose |
| --- | --- |
| `registerActivation(definition)` | Registers an activation rule and returns a function that removes that registration |
| `registerExtension(definition)` | Registers an extension rule and returns a function that removes that registration |
| `activation(reference)` | Looks up an activation rule by coordinate |
| `extension(reference)` | Looks up an extension rule by coordinate |
| `validate(manifest, protocols?, options?)` | Validates a component and returns a `ManifestValidationReport` |

Duplicate coordinates within a rule category throw an error during registration. Lookup methods return `undefined` when no rule matches.

### Checking content and generating reports

`validate()` first calls `defineComponentManifest()` to check the shared structure, then visits each facet:

1. Looks up the activation rule and calls `validateSpec()`.
2. If the caller supplies core's `ProtocolCatalog`, calls `understands()` for protocol requirement and support coordinates.
3. Looks up each extension rule and calls `validateMetadata()` (when present), followed by `validateSpec()`.

A rule returning normally indicates success; thrown errors are collected in the report. Validation uses the rules' checking results and preserves the declaration's existing content.

The report's `apiVersion` is `manifest.dsh/report/v1alpha1`. It contains component and validator identities, `source`, `digest`, `issues`, and `compatible`. Each issue records its category, severity, field path, and message.

Missing rules or unknown protocol coordinates produce `warning` issues. Registered rules that fail produce `error` issues. `compatible` is `true` when the report contains no `error` issues.

Callers can provide a source and digest through `options`. The default source is `memory:`. The default digest is calculated by serializing the component with sorted object keys and preserved array order, then computing a 32-bit FNV-1a value with the `fnv1a32:` prefix. The validator identity can be supplied when creating the catalog; it defaults to this package's name and version.

## Parsing and converting package manifests

The package supports the `dsh-plugin.json` format defined in the [DSH Community Interoperability Draft v0.15](https://github.com/deepseek-ai/deepseek-harness/discussions/2714). The format is identified by `manifestVersion: "0.15"`.

| Interface | Usage and result |
| --- | --- |
| `parseManifest(source, options?)` | Accepts JSON text and returns a normalized object through `JSON.parse()` and `defineManifest()`; `options.source` identifies the source in error messages |
| `validateManifest(value)` | Checks the package manifest version and field structure |
| `defineManifest(manifest)` | Validates, copies, supplies empty containers, and recursively freezes the object |
| `projectManifest(manifest)` | Validates and normalizes a package manifest, then returns its internal component representation |

Normalization supplies empty containers for `requires.contracts`, `permissions`, `contributes.commands`, and `subscriptions`. `parseManifest()` throws `SyntaxError` for malformed JSON and `TypeError` for field or version errors.

The v0.15 conversion produces one facet named `host`, with the following main field mappings:

| Package manifest information | Internal component location |
| --- | --- |
| `id`, `name`, `version` | `metadata.name`, `metadata.displayName`, `metadata.version` |
| `facets.host.entry` | `spec.module` of a `lifecycle.dsh/v1alpha1 FacetModule` activation declaration |
| `requires.contracts` | `protocols.requires`; optional flags are preserved and fallback descriptions become `x-community-fallback` |
| `permissions` | `community.dsh/v1alpha1 Permission` requests containing action, scope, and reason |
| `contributes.commands` | `commands.dsh/v1alpha1 Command` extensions containing title and description |
| `x-*` arrays in `contributes` | Objects containing `apiVersion`, `kind`, `id`, `name`, and `spec` become corresponding extensions |

A command's local name is the last segment of its full ID. The full ID is stored in the `dsh.std/contribution-id` label. Subscriptions, source, artifact, and installation information remain in the normalized `PluginManifest`. The internal conversion extracts the component and facet information listed above.

The schema's package export path is `@dsh-std/manifest/schema/dsh-plugin-0.15.schema.json`.

## Downstream integration

Callers pass `ComponentManifest` to composition to create a plan, which lifecycle uses for activation. Adapters connect declarations and validation reports to the product integration flow.

Four helper interfaces let these modules locate declarations:

| Interface | Result |
| --- | --- |
| `findFacet(manifest, name)` | Returns a facet by name, or `undefined` if none matches |
| `facetIdentity(manifest, facet)` | Returns an identity containing component name, version, and facet name |
| `facetKey(identity)` | Converts the identity to a `component@version#facet` string |
| `matchesExtensionPublicationName(extension, name)` | Checks whether a name matches the extension's local name or full contribution ID |
