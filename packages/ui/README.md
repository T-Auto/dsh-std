# @dsh-std/ui

`@dsh-std/ui` defines the domain-neutral envelope for UI surface negotiation and activation-scoped contributions. Products own concrete surface coordinates, descriptor schemas, renderers, and adapters.

`host-rendered` contributions contain JSON data. `local-module` contributions additionally carry a same-process executable value and must never cross an endpoint.

The existing helpers retain `ui.dsh/v1alpha1` and its all-required `surfaces` semantics. `contributionHostRequirementV2` and `contributionHostSupportV2` explicitly use `ui.dsh/v1alpha2`; a requirement can add `optionalSurfaces` without repeating a core protocol coordinate. Missing optional surfaces produce warnings and are omitted from the agreement. Ambiguous providers and malformed requirements still fail.

`register` installs both exact definitions; it does not make a product advertise either version. Products must publish real versioned support and map their concrete surfaces into the scoped client. Package declarations must use a facet or namespaced extension that preserves requirement specs; Community Manifest 0.15 root contracts cannot carry them.

See the [protocol proposal](../../docs/proposals/ui-contribution.zh.md) for validation, compatibility, and lifecycle requirements.
