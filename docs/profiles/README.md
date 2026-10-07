# Cross-Profile Application Guide

English | [中文](README.zh.md)

- Document type: application guide (informative)
- Status: living document; revised as the ecosystem's profile layer evolves
- Date: 2026-10-07

This guide explains how one plugin package relates to the several **profile compositions**
that may mount it. It is guidance for authors, profile owners, and review/CI tooling.

It creates no protocol coordinate and changes no protocol semantics: protocol semantics
remain in [`docs/proposals/`](../proposals/README.zh.md), and the requirements of a
concrete profile remain with that profile's owner.

## 1. Why "multi-profile" is the baseline

A running `dsh` is a plugin tree composed at boot from ordered layers. A **profile** is a
named composition stored in the Harness home; it lists the bundles it stacks, the
out-of-tree plugins it installs, and its own `cordis.patch.yml`. DSH ships template
profiles for its own product shapes, and a product may add its own profile on top of the
same mechanism.

Three consequences matter to a plugin author:

- the same plugin package MAY be mounted by several profiles, by exactly one profile, or
  by none;
- two profiles that mount the same package MAY present a different user interface, a
  different interaction model, or no user interface at all;
- a profile name is a **composition input**, not a protocol, not a negotiation result,
  and not a capability claim. A profile name MUST NOT be used in place of a declared
  requirement and a negotiated agreement.

## 2. Four similar words, four different things

The word "profile" is used for two unrelated things in the DSH ecosystem, and two more
that are close to them. Authors who conflate them produce packages that only work in the
environment their author happened to test.

| Term | What it is | Who defines it |
| --- | --- | --- |
| Composition profile (DSH profile) | A named composition of bundles, plugins, and patch layers that a `dsh` process boots from | The DSH product (for the shipped templates) or the product/operator that adds one |
| Product shape / realm | The class of environment a product presents: terminal, browser, desktop GUI, or no user interface (headless, SDK, automation) | The product |
| Admission profile (profile specification) | Extra admission, compatibility, evidence, and disclosure rules that a product shape adds **on top of** the public protocols | The profile's owner, carried in the ecosystem's profile layer |
| UI profile | A composition's selection of a UI class and the facets that fit it — std vocabulary for facet selection, not a product identity | [`@dsh-std/ui`](../proposals/ui-contribution.zh.md) |

Only the last one belongs to DSH Standard. The other three belong to a product or to the
ecosystem's profile layer. This guide uses **composition profile** for the first and
**admission profile** for the third.

## 3. What is shared, what is profile-specific

| Layer | Owner | Examples | What a plugin may rely on |
| --- | --- | --- | --- |
| Meta-protocol and domain protocols | DSH Standard | protocol coordinates, static manifests, negotiation results, component/facet/activation identity, ownership and cleanup rules | Only what its own declaration and the negotiated agreement cover |
| Admission profile | The profile's owner | admission requirements and their identifiers, evidence and claim rules, verification entry points, trust disclosure, profile-level presentation conventions | Only when that profile is an intended target and its requirements are met |
| Product and runtime | The product | services, credentials, storage locations, sandbox and approval policy, filesystem, user-interface widgets | Only through declared requirements, negotiated support, or that product's own documented plugin API |

Rules that follow from this table:

- A plugin MUST NOT treat a profile name, shell name, surface name, key binding, theme
  token, or renderer API as standard semantics.
- Portable behavior MUST come from declared requirements, negotiated support, and
  documented fallbacks — never from "which profile am I running in".
- A missing optional capability MUST degrade, not fail: the package SHOULD remain
  loadable and its unaffected facets SHOULD stay functional.
- Requirements that cannot be satisfied in some profile SHOULD be declared optional with
  a stated fallback, so that a host can report a degraded agreement instead of a failure.

## 4. Author checklist across profiles

A package intended for the ecosystem SHOULD:

1. **Separate facets by concern** — business logic and UI code as distinct facets, so a
   profile without a UI, or with a different UI, can still activate the business part.
2. **Treat "no user interface" as a first-class target** — headless, SDK, and automation
   compositions are shipped product shapes, not edge cases.
3. **Declare, do not assume** — every capability the package needs is a requirement with
   an optional/fallback form where possible.
4. **Feature-detect at runtime** — probe an optional service and degrade silently when it
   is absent; absence of an optional seam is a normal state.
5. **Keep one source of truth per feature** — when the same feature must appear in two
   shapes, project it from one state, rather than maintaining two implementations that
   drift.
6. **Route interaction through the presentation layer** — questions, approvals,
   notifications, and navigation to external resources belong to the presentation
   protocol, not to a shell-specific API.
7. **Describe a shell-specific surface instead of hard-coding it** — if a shape needs its
   own registration surface, describe it as a surface definition; do not promote one
   product's slot, widget, or event names into general semantics.
8. **Declare permissions and keep them revocable** — a profile MAY grant less than
   another; authorization MUST NOT be inferred from a profile name.
9. **Keep the version axes apart** — package version, protocol `apiVersion`, and profile
   admission version are three independent axes; a package SHOULD state which of them it
   was verified against, and where.
10. **Verify per target shape** — headless, browser, and terminal verification are
    different exercises; a package that claims several shapes SHOULD have evidence for
    each.

## 5. Shapes to plan for today

The list below is illustrative, not closed. The authoritative list of declared admission
profiles is the ecosystem's profile layer, and profile names MAY change.

| Shape | Carrier (example) | What the author SHOULD expect |
| --- | --- | --- |
| Browser shell | DSH's shipped `web` template profile | A browser-realm presentation; UI contributions may be rendered by a browser shell; no terminal control sequences |
| Terminal shell | The ecosystem's declared [TUI admission profile](dsh-tui.md); its text is carried by the terminal product's own repository | A terminal-realm presentation; UI surfaces are terminal-shaped; interaction is key- and text-oriented; expect admission checks with that profile's own stable identifier prefix (for this profile, `TUI-*`) |
| Desktop GUI | A product or pack that composes a desktop application | A product-specific shell on top of the same protocols; expect its own admission and distribution rules |
| No UI (headless / SDK / automation) | DSH's shipped `headless`, `sdk`, `sdk-minimal`, and `acp` template profiles | No UI facet is activated; business facets MUST remain fully usable and MUST NOT block on a UI requirement |

A plugin that targets the ecosystem SHOULD plan for at least a browser-shell shape, a
terminal-shell shape, and a no-UI shape. That set is what makes a package genuinely
portable rather than portable on paper.

## 6. Profile mount points in this repository

This directory is where DSH Standard **links** the profile layer. It does not carry
admission text.

- Convention: each declared admission profile MAY have at most one page here, named
  `docs/profiles/<profile-id>.md`, containing: profile id and name, product shape,
  owner/carrier, links to the authoritative text, admission version, verification entry
  point, trust model, and the author-facing guidance for plugins targeting it.
- A page takes one of two shapes. A **pointer page** only locates the owner's text. An
  **interface reference** additionally catalogues the profile's plugin-facing interface, as
  the mounted [TUI page](dsh-tui.md) does. Both defer to the owner: the owner's text stays
  authoritative for admission policy, requirement identifiers, and acceptance decisions, and
  a page here is corrected when it disagrees.
- The profile's normative admission text is **not copied here**; this repository records
  where it lives and how to reach it.
- Mounted: [dsh-tui.md](dsh-tui.md) — the TUI admission profile's plugin interface. The
  ecosystem's profile layer declares that profile, its text is carried by the terminal
  product's repository ([ccch1mneyyy/dsh-TUI](https://github.com/ccch1mneyyy/dsh-TUI),
  in-repo `tui-profile/`), and its machine-readable registry entry is not yet published.
- A profile owner who wants a page here SHOULD provide the fields listed above, with links
  to the authoritative text.

## 7. Relationship to protocols

- This guide defines no coordinate, no schema, no negotiation rule, and no requirement on
  any project. Adopting a profile remains voluntary.
- If the profile layer ever needs normative semantics of its own, that work belongs in a
  proposal under [`docs/proposals/`](../proposals/README.zh.md) and in the owning profile,
  not in this guide.
- Profile admission requirements constrain only the ecosystem scope their owner declares.
  Registering or linking a profile here does not endorse it, certify an implementation, or
  transfer its ownership.

## 8. See also

- [TUI admission profile — plugin interface](dsh-tui.md)
- [Architecture](../architecture.md) — where product implementations begin
- [`@dsh-std/ui` proposal](../proposals/ui-contribution.zh.md) — profile selection, facets, contributions, and surfaces
- [Composition proposal](../proposals/composition.zh.md) — activation planning
- [Repository README](../../README.md) — the layered, optional, non-coercive vision
- Ecosystem profile layer: [dsh-ecosystem-spec `profiles/`](https://github.com/T-Auto/dsh-ecosystem-spec/tree/main/profiles) and its [`registry/profiles.json`](https://github.com/T-Auto/dsh-ecosystem-spec/blob/main/registry/profiles.json)
- DSH product documentation for composition profiles and bundles: [deepseek-harness `docs/architecture.md`](https://github.com/deepseek-ai/deepseek-harness/blob/main/docs/architecture.md)
