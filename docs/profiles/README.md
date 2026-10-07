# Cross-Profile Application Guide

English | [中文](README.zh.md)

- Document type: application guide (descriptive, not normative)
- Status: living document; revised as the ecosystem's profile layer evolves
- Date: 2026-10-07

DSH is a multi-profile system: the same plugin package can be mounted by more than one
product composition. This guide is written from that need. It describes what a plugin
author usually runs into when the same package has to work in a browser shell, a terminal
shell, a desktop shell, or no user interface at all, and it is where the profile layer is
linked from.

It is descriptive on purpose: it defines no coordinate, adds no requirement, and constrains
no project. Protocol semantics remain in [`docs/proposals/`](../proposals/README.zh.md), and
the requirements of a concrete profile remain with that profile's owner.

## 1. Multi-profile is the baseline

A running `dsh` is a plugin tree composed at boot from ordered layers. A **profile** is a
named composition stored in the Harness home; it lists the bundles it stacks, the
out-of-tree plugins it installs, and its own `cordis.patch.yml`. DSH ships template
profiles for its own product shapes, and a product can add its own profile on the same
mechanism.

Three observations follow, and each of them shows up in day-to-day plugin work:

- the same plugin package can be mounted by several profiles, by exactly one, or by none;
- two profiles that mount the same package can present a different user interface, a
  different interaction model, or no user interface at all;
- a profile name is a **composition input**. It is not a protocol, not a negotiation
  result, and not a capability claim: what a package can rely on still comes from what it
  declares and what the host negotiates.

## 2. Four similar words, four different things

"Profile" is used for two unrelated things in the DSH ecosystem, plus two more that are
close to them. Keeping them apart is most of what cross-profile work is about.

| Term | What it is | Who defines it |
| --- | --- | --- |
| Composition profile (DSH profile) | The named composition of bundles, plugins, and patch layers that a `dsh` process boots from | The DSH product (shipped templates), or the product/operator that adds one |
| Product shape / realm | The class of environment a product presents: terminal, browser, desktop GUI, or no user interface (headless, SDK, automation) | The product |
| Admission profile (profile specification) | Admission, compatibility, evidence, and disclosure rules a product shape adds on top of the public protocols | The profile's owner, carried in the ecosystem's profile layer |
| UI profile | A composition's selection of a UI class and the facets that fit it — standard vocabulary for facet selection, not a product identity | [`@dsh-std/ui`](../proposals/ui-contribution.zh.md) |

Only the last one belongs to DSH Standard. The other three belong to a product or to the
ecosystem's profile layer. This guide uses **composition profile** for the first and
**admission profile** for the third.

## 3. Shared surfaces and profile-specific surfaces

| Layer | Owner | Examples | What a plugin sees |
| --- | --- | --- | --- |
| Meta-protocol and domain protocols | DSH Standard | protocol coordinates, static manifests, negotiation results, component/facet/activation identity, ownership and cleanup rules | The declared requirements and the negotiated agreement |
| Admission profile | The profile's owner | admission requirements and their identifiers, evidence and claim rules, verification entry points, trust disclosure, profile-level presentation conventions | Extra conditions that apply when that profile is the intended target |
| Product and runtime | The product | services, credentials, storage locations, sandbox and approval policy, filesystem, user-interface widgets | Whatever the product documents, plus the negotiated parts of the layers above |

Practical consequences, in the order authors usually meet them:

- Profile names, shell names, surface names, key bindings, theme tokens, and renderer APIs
  are product vocabulary. Code that branches on them tends to work in exactly one place.
- Portable behavior comes from declared requirements, negotiated support, and documented
  fallbacks — not from detecting which profile is running.
- A missing optional capability is a normal state, not a failure: degrading quietly keeps
  the package loadable and its unaffected parts useful.
- A capability that cannot be satisfied everywhere is usually declared optional with a
  stated fallback, so a host can report a degraded agreement instead of a hard failure.

## 4. Practices that travel well

The following habits are what tends to make one package work across several shapes:

1. **Separate facets by concern** — business logic and UI code as distinct facets, so a
   profile with a different UI, or with none, can still activate the business part.
2. **Treat "no user interface" as a first-class target** — headless, SDK, and automation
   compositions are shipped product shapes, not edge cases.
3. **Declare, do not assume** — express what the package needs as requirements, with an
   optional/fallback form where one exists.
4. **Feature-detect at runtime** — probe an optional service and degrade quietly when it is
   absent; an absent optional seam is a normal state.
5. **Keep one source of truth per feature** — when a feature has to appear in two shapes,
   project it from one state instead of maintaining two implementations that drift.
6. **Route interaction through the presentation layer** — questions, approvals,
   notifications, and navigation to external resources belong to the presentation
   protocol rather than to a shell-specific API.
7. **Describe a shell-specific surface instead of hard-coding it** — when a shape needs its
   own registration surface, a surface definition describes it; one product's slot, widget,
   or event names stay that product's vocabulary.
8. **Keep authorization negotiated** — a profile may grant less than another, and the grant
   comes from the negotiated result, not from the profile name.
9. **Keep the version axes apart** — package version, protocol `apiVersion`, and profile
   admission version are three independent axes; it helps to say which one a package was
   verified against, and where.
10. **Verify per target shape** — headless, browser, and terminal verification are
    different exercises, and a package claiming several shapes is more believable with
    evidence for each.

## 5. Shapes to plan for today

The list below is illustrative, not closed. The authoritative list of declared admission
profiles is the ecosystem's profile layer, and profile names may change.

| Shape | Carrier (example) | What to expect |
| --- | --- | --- |
| Browser shell | DSH's shipped `web` template profile | A browser-realm presentation; UI contributions may be rendered by a browser shell; no terminal control sequences |
| Terminal shell | The ecosystem's declared TUI admission profile, linked in [dsh-tui.md](dsh-tui.md); its text is carried by the terminal product's own repository | A terminal-realm presentation; UI surfaces are terminal-shaped; interaction is key- and text-oriented; admission checks use that profile's own stable identifier prefix (`TUI-*`) |
| Desktop GUI | A product or pack that composes a desktop application | A product-specific shell on the same protocols, with its own admission and distribution rules |
| No UI (headless / SDK / automation) | DSH's shipped `headless`, `sdk`, `sdk-minimal`, and `acp` template profiles | No UI facet is activated; the business facets need to stand on their own, and a UI requirement is better expressed as optional so it cannot block them |

A plugin that wants to be usable across the ecosystem usually designs for at least a
browser shape, a terminal shape, and a no-UI shape. That set is what makes a package
portable in practice rather than on paper.

## 6. Profile pages in this repository

This directory is where DSH Standard **links** the profile layer. It does not carry
admission text.

- Each declared admission profile may have at most one page here, named
  `docs/profiles/<profile-id>.md`. A page is a pointer: profile id, product shape, owner or
  carrier, and hyperlinks to the authoritative text.
- The authoritative text stays with its owner. The links point at the owner's current
  revision, so the owner can revise the profile while working on the product without a
  second edit here; the owner's own git history carries older revisions.
- Pages therefore stay short, and they deliberately do not restate admission versions,
  requirement identifiers, seam lists, permission names, or verification steps that the
  owner already states.
- Mounted pages: [dsh-tui.md](dsh-tui.md) — the TUI admission profile.
- The ecosystem's profile layer keeps the machine-readable side: a profile can be indexed
  there once its owner publishes an entry.

## 7. Relationship to protocols

- This guide defines no coordinate, no schema, and no negotiation rule, and sets no
  requirement on any project. Adopting a profile stays voluntary.
- If the profile layer ever needs normative semantics of its own, that work belongs to the
  owning profile and to a proposal under [`docs/proposals/`](../proposals/README.zh.md),
  not to this guide.
- Profile admission requirements constrain the ecosystem scope their owner declares.
  Linking a profile here does not endorse it, certify an implementation, or move its
  ownership.

## 8. See also

- [TUI admission profile (link page)](dsh-tui.md)
- [Architecture](../architecture.md) — where product implementations begin
- [`@dsh-std/ui` proposal](../proposals/ui-contribution.zh.md) — profile selection, facets, contributions, and surfaces
- [Composition proposal](../proposals/composition.zh.md) — activation planning
- [Repository README](../../README.md) — the layered, optional, non-coercive vision
- Ecosystem profile layer: [dsh-ecosystem-spec `profiles/`](https://github.com/T-Auto/dsh-ecosystem-spec/tree/main/profiles) and its [`registry/profiles.json`](https://github.com/T-Auto/dsh-ecosystem-spec/blob/main/registry/profiles.json)
- DSH product documentation for composition profiles and bundles: [deepseek-harness `docs/architecture.md`](https://github.com/deepseek-ai/deepseek-harness/blob/main/docs/architecture.md)
