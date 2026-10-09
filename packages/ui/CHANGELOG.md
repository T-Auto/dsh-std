# Changelog

Changes to `@dsh-std/ui` are recorded here.

## Unreleased

- Added explicit `ui.dsh/v1alpha2` ContributionHost requirements and support helpers for mixed required and optional surfaces.
- Preserved strict `v1alpha1` validation and default helper coordinates; omitted unavailable optional surfaces from agreements without guessing between providers.
- Registered both exact protocol definitions with rollback on partial registration failure.

## 0.1.1-rc.1

- Aligned the package with the workspace `0.1.1` prerelease line without changing the existing UI protocol semantics.

## 0.1.0-rc1

- Defined the activation-scoped `ContributionHost` protocol and static `UiContribution` extension.
- Added validated host-rendered and same-process local-module registration with deterministic cleanup ownership.
