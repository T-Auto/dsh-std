# @dsh-std/manifest

Component declarations and validation tools for std's internal modules. Callers provide component information and content validation rules. This package organizes the information into a shared `ComponentManifest`, checks its structure and content, and supplies it to composition for planning, lifecycle for activation, and adapters for product integration.

A component declaration contains its identity, each facet's activation settings, protocol requirements and supports, extensions, permission requests, and relationships with other components. `ManifestDefinitionCatalog` stores activation and extension validation rules registered by callers. Callers can also supply core's `ProtocolCatalog` to check referenced protocols. `ManifestValidationReport` collects the content validation results.

The package also parses and normalizes the `dsh-plugin.json` format defined in the [DSH Community Interoperability Draft v0.15](https://github.com/deepseek-ai/deepseek-harness/discussions/2714) and converts it into the internal model. It exports the packaged schema at `@dsh-std/manifest/schema/dsh-plugin-0.15.schema.json`.

See the [component design (Chinese)](../../docs/proposals/manifest.zh.md) for the model, validation flow, interfaces, and downstream integration.
