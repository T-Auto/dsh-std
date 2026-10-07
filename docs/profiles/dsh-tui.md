# TUI admission profile

English | [中文](dsh-tui.zh.md)

- Page type: profile link page (informative; no profile text is copied here)
- Profile id: `dsh-tui`
- Product shape: terminal shell (TUI)

| | |
| --- | --- |
| Owner / carrier | [ccch1mneyyy/dsh-TUI](https://github.com/ccch1mneyyy/dsh-TUI) |
| Profile text lives in | That repository, in [`tui-profile/`](https://github.com/ccch1mneyyy/dsh-TUI/tree/main/tui-profile), next to the product code — it is revised with the code |
| Ecosystem scope | Terminal-shape products and the sub-plugins that target them |

## Authoritative text

Follow the links; the owner's repository is the source of truth for every admission detail.

- [Profile admission and development guide](https://github.com/ccch1mneyyy/dsh-TUI/blob/main/tui-profile/docs/plugin-admission-and-development.md) — profile overview, admission requirements (identified by the profile's own stable prefix, `TUI-*`), the plugin contract, the seam catalogue, and the verification checklist
- [Profile root](https://github.com/ccch1mneyyy/dsh-TUI/tree/main/tui-profile) — README, governance, notes, and the admission checklist
- [Profile registry](https://github.com/ccch1mneyyy/dsh-TUI/tree/main/tui-profile/registry) and [conformance](https://github.com/ccch1mneyyy/dsh-TUI/tree/main/tui-profile/conformance) — machine-checkable profile data and fixtures
- [Ecosystem plugins and the plugin template](https://github.com/dsh-tui-ecosystem)
- Ecosystem index side: [dsh-ecosystem-spec `profiles/`](https://github.com/T-Auto/dsh-ecosystem-spec/tree/main/profiles)

## What this page deliberately does not state

Admission version, requirement identifiers, seam list, permission names, trust disclosure,
and verification entry points all live in the owner's text and change with it. Restating
them here would create a second copy that goes stale the moment the terminal product
revises its profile — so this page only points at them.

## For plugins targeting this profile

- Start from the owner's admission and development guide (first link above).
- The terminal shape is one of the shapes described in the
  [cross-profile application guide](README.md); that guide's practices are what make the
  same package work here and in a browser or no-UI composition.
