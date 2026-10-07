# TUI admission profile — plugin interface

English | [中文](dsh-tui.zh.md)

- Page type: profile interface reference (interface catalogue; admission policy authority stays with the owner)
- Profile id: `dsh-tui`
- Product shape: terminal shell (TUI)
- Interface edition described: `@deepseek-harness-tui/dsh-tui` **0.13.0** (repository `main` at `cf903154`, 2026-10-07)
- Owner / carrier: [ccch1mneyyy/dsh-TUI](https://github.com/ccch1mneyyy/dsh-TUI)
- Authoritative admission text: [`tui-profile/docs/plugin-admission-and-development.md`](https://github.com/ccch1mneyyy/dsh-TUI/blob/main/tui-profile/docs/plugin-admission-and-development.md)

This page is the complete plugin-facing interface of the TUI admission profile at the
edition above: what a sub-plugin can import, which services exist, what each one accepts
and rejects, what it costs, who owns cleanup, and which permission gates it. It is written
for cross-profile readers, so it also records how each seam behaves when its service is
absent.

**Authority.** The owner's text remains authoritative for admission policy: requirement
identifiers, acceptance decisions, and the meaning of a claim. Where this page and the
owner's text differ, the owner's text wins, and this page is corrected to match it.

## 1. How a plugin is mounted

| Aspect | Contract |
| --- | --- |
| Module shape | `export const name`, `export type Config`, `export const Config` (a schema with defaults), `export function apply(ctx, config)`. No default export at the package root |
| Missing configuration | Every key has a default (`Schema.…().default(…)` or `??` in `apply`); a plugin that is absent or misconfigured degrades to "nothing happened" and never fails boot |
| Detection | Optional services are probed with `ctx.get('<service>', false)`; an absent service is a normal state, not an error. The shipped profile does not list them in `inject` |
| Composition | The package ships its own `cordis.patch.yml` (`dsh.bundle.patch` in `package.json`); rows are inserted or overridden by id. An override row replaces the whole `config` of the target row |
| Static manifest | `dsh-plugin.json` (Community v0.15) parsed by the fixed `@dsh-std/manifest` revision; the profile adds its own admission checks on top (identifiers `TUI-PKG-*`, `TUI-HOST-*`, `TUI-RUN-*`, `TUI-OBS-*`, `TUI-DEP-*`, `TUI-TRUST-*`) |
| Negotiation | Five results — `compatible`, `compatible_degraded`, `waiting_authorization`, `rejected`, `unknown` — computed per **plugin**, not per seam, from declared contracts, facet versions, and permissions. Only `compatible` and `compatible_degraded` load |
| Identity | After admission the host binds a verified component identity (component id + activation instance). Every service derives the caller from the passed `ctx`; there is no parameter for naming another plugin |
| Trust model | `trusted-in-process`: permissions are compatibility, disclosure, and audit constraints, not an isolation boundary |

### 1.1 Entry subpaths

| Subpath | Kind | Contents |
| --- | --- | --- |
| `.` | value | the Cordis plugin factory |
| `./extensions` | value + types | managed extension services (dialogs, status, shortcuts, renderers, toast, themes) |
| `./scenes` | value + types | full-screen scene registry |
| `./panels` | value + types | side-panel registry |
| `./settings-sections` | value + types | declarative `/settings` sections |
| `./command-trees` | value + types | command completion providers |
| `./workspaces` | value + types | workspace providers |
| `./plugin-host` | value + types | admission anchor: generation, grants, storage, message observation, effect ledger, command attribution |
| `./api` | types (+ 1 constant) | curated seam types. It also exports the runtime constant `TUI_PANEL_API_VERSION`, so it is not literally types-only |
| `./jsx-runtime` | value | re-export of the host React JSX runtime for scene/panel authors |
| `./working-activity` | value | the bundled activity-line plugin re-exported so a profile can mount it by subpath |
| `./oauth`, `./invariant`, `./settings.json`, `./cordis.patch.yml` | value/asset | product-support entries; not part of the sub-plugin interface described here |

## 2. Seams provided by the host product

These come from the underlying DSH product rather than from the TUI profile, and the
profile only consumes them.

| Seam | Form | Notes for a plugin author |
| --- | --- | --- |
| Session events | `ctx.on('session/event' \| 'agent/status' \| 'session/disposed', …)` | The persisted session log is the source of truth. A plugin MAY append its own event type, and then two rules apply: the event is log-only (no `surfaceOp`), and the type is registered into every reachable `dsh-session` copy's `KNOWN_SESSION_EVENT_TYPES`, otherwise the session stops resuming outside this profile |
| Prompt slot | `ctx.tuiPrompt` | The **product's official TUI host** provides this; this profile does not. A plugin that only registers a prompt slot is silently inert here — the portable pattern is a dual outlet (slot for the official host, log-only event for this profile and other consumers) |
| Skill packaging | `skills/<name>/SKILL.md` + the skills registry | Static asset and zero code; invalid or duplicate entries are skipped rather than failing the host |
| Static themes | `~/.dsh-tui/themes/<name>.json` | Multi-tone JSON with `base` and partial `colors`; unknown keys and invalid colors are skipped, a corrupt file is dropped entirely |
| System prompt sections | `ctx.inject(['systemPrompt'], …)` → `section({ name, order, text })` | Enters every request and affects KV-cache stability; inject only what must be stable |
| Profile composition | the package's `cordis.patch.yml` | Row order matters; do not re-mount rows the base profile already mounts |

## 3. Managed extension services (`dsh-tui-extensions` row)

The row mounts six services. All of them: reject with a warning instead of throwing (the
exception is noted per row), derive the caller from `ctx`, bind the returned disposer to
the caller's activation automatically, and record their effects in the ledger when an
`identity` argument is supplied.

| Service | Entry | Versioning | Rejection returns | Quota | Cleanup |
| --- | --- | --- | --- | --- | --- |
| `ctx.tuiScenes` | `./scenes` | contract coordinate `tui.dsh/v1alpha1#Scene`; no `apiVersion` field | **throws** on an invalid or duplicate id, a root caller, or a foreign identity; `open()/close()` warn and return `false` | none | auto-bound to the caller activation; disposing closes an open scene |
| `ctx.tuiDialogs` | `./extensions` | none | `select` → `undefined`, `confirm` → `false`, `input` → `undefined`; malformed requests are settled as cancelled, never thrown (shadow modes excepted) | title/label ≤120 cells, message ≤400, input ≤500, ≤100 options; default timeout 30 s, clamped ≤24 h | queued and active dialogs settle as cancelled when the caller deactivates |
| `ctx.tuiStatus` | `./extensions` | none; `registerView` is detected by method presence | `set` → no-op disposer; `registerView` → `undefined` | 20 keys; text ≤200 cells; rich views 1–3 rows and 6 rows in aggregate | text disposer is value-guarded; views clear on dispose; both auto-bound |
| `ctx.tuiShortcuts` | `./extensions` | none; reserved combinations are read live so a user re-binding moves them | no-op disposer | none | auto-bound; handler errors are routed to a toast |
| `ctx.tuiRenderers` | `./extensions` | none; the built-in event vocabulary is frozen at module load | no-op disposer | output ≤100 lines, ≤400 cells per line, title ≤120 cells; one warning per event type | auto-bound |
| `ctx.tuiToast` | `./extensions` | none (marked experimental in the owner's overview) | `false` for invalid input, rate limit, or no delivery sink | text ≤200 cells; timeout clamped 500–12 000 ms; **20 calls per minute per activation** | no cleanup responsibility; a toast is transient display |
| `ctx.tuiThemes` | `./extensions` | none | no-op disposer; a descriptor with any invalid color is rejected as a whole | 128 runtime themes; display name ≤120 cells; built-in names reserved | auto-bound; a host resolver is released on teardown |

Behaviour worth knowing before adopting one:

- **Scenes** are the full-screen surface. The scene component receives the host `React`
  instance and the `ui` kit as props; hooks and JSX must go through them
  (`jsxImportSource` → this package). A render error is caught and closes the scene; effect
  and async errors remain the scene's own responsibility. Opening a scene does not touch
  the session log.
- **Dialogs** queue FIFO, one at a time. The `id` of a `select` option is an opaque token:
  it is validated for type and non-emptiness and returned unchanged, not sanitized.
- **Status** `set` and `registerView` share one key namespace. The text form is display-only;
  the rich form supports pointer events and gets one error boundary per key.
- **Shortcuts** must carry `ctrl` or `alt`, must not collide with built-in bindings, and are
  dispatched only in the plain chat state — any overlay, picker, dialog, or scene owns the
  keyboard while it is open. `escape` combinations are rejected outright because every Esc
  arrives with `meta` set on this terminal input path.
- **Renderers** map a plugin-appended log-only event type to plain text lines. They
  deliberately receive no React: transcript rows are replayed too, where a crash would ruin
  the screen.
- **Toasts** are fire-and-forget display; `sticky` is a host-only facility, and an
  over-limit caller is told once, then silently dropped.

## 4. Resource services on their own rows

| Service | Row | Entry | Versioning | Rejection returns | Quota / limits | Ownership |
| --- | --- | --- | --- | --- | --- | --- |
| `ctx.tuiSettingsSections` | `dsh-tui-settings-sections` | `./settings-sections` | contract coordinate `tui.dsh/v1alpha1#SettingsSection`; the runtime `register()` does not validate a descriptor field for it | throws on a duplicate namespace or an unknown group; the section is otherwise declarative | no field, option, or text-length limit at registration | reads and events are filtered to the caller's own sections |
| `ctx.tuiCommandTrees` | `dsh-tui-command-trees` | `./command-trees` | none | throws on an invalid or duplicate root | none on the provider result | each caller reads only its own roots |
| `ctx.tuiWorkspaces` | `dsh-tui-workspaces` | `./workspaces` | provider scheme; the profile's mapped coordinate is superseded | provider calls are bounded by a 2 s budget and degrade; owner-scoped reads return only the caller's providers | no provider-count or scheme-conflict check | mutations require a provider of the caller vouching for the path |
| `ctx.tuiPanels` | `dsh-tui-panels` | `./panels` | **`apiVersion: 1`, must match exactly** | `register` → `undefined`; `open/close/badge` → `false`; `subscribe` → no-op disposer | ≤4 panels per plugin, ≤32 globally; `open` limited to one per plugin per 5 s; three crashes within 60 s disable the panel for the session | every mutating call checks the registration's activation; foreign ids are refused |

**Settings sections** are declarative: the plugin describes editable fields
(`text` / `number` / `boolean` / `select`, plus `secret: { ref }` for credentials), and the
host owns rendering, draft editing, save/discard, and revision-conflict retry. Fields with a
secret reference never enter the settings document.

**Command trees** extend command completion: a provider contributes children and
descriptions under a root that matches one of its registered commands. An exception from a
provider yields an empty list rather than blocking command execution.

**Workspaces** let a plugin claim a workspace scheme: targets, choices, commands, and
shell execution are described by the provider, and the runtime falls back to a local
implementation when no provider is mounted.

**Panels** are the terminal sidebar. See §6.

## 5. Admission and trust services (`dsh-tui-plugin-host` row)

| Service | Entry | What a plugin gets |
| --- | --- | --- |
| `ctx.tuiPluginHost` | `./plugin-host` | `generationId` (fresh per row activation), a caller-safe `grants` facade (`allows`, `defaultOf`, `knownPermissions`, `onChange`), a read-only `probeDecisionEvents()`, `selfCheck()`, `registerCommand(pluginCtx, definition)`, and `subscribeDecision(pluginCtx, event, listener, { scope, order })` |
| `ctx.tuiPluginStorage` | `./plugin-host` | `open(ctx)` → `{ get, set, delete }` for `storage.local`; namespace derived from the verified component identity |
| `ctx.tuiMessageObserver` | `./plugin-host` | `subscribe(ctx, listener, { scope })` for `messages.observe` |
| `ctx.tuiEffectLedger` | `./plugin-host` | `record(entry, identity?)`, append-only, never throws |

- **Command attribution.** `registerCommand` stamps the verified component onto the
  definition and returns a disposer. A duplicate registration maps to the contract error
  code `DUPLICATE_CONTRIBUTION_ID`. Attribute-free definitions (registered directly against
  the command service) stay outside the checkpoint.
- **Decision events.** Subscription requires the private `tui.dsh/v1alpha1#DecisionEvents`
  contract plus the grant for that event. Six event names exist: `tui/input`,
  `tui/rewind-prompt`, `tui/rewind-done`, `tui/session-switch`, `tui/session-switched`,
  `tui/compact`. Decision points are ordered and awaited one handler at a time; the first
  valid decision wins, a malformed return counts as no opinion, and a throwing or slow
  handler is skipped (1 s per handler, 5 s total). Notification events are broadcast after
  the fact and carry no decision.
- **Storage.** Keys are non-empty, ≤128 characters, and free of control characters. Values
  must be exact JSON values: `undefined`, `NaN`/`Infinity`, functions, symbols, `BigInt`,
  class instances, sparse arrays, and cycles are rejected rather than quietly reshaped.
  Quota is 256 keys / 256 KiB per namespace. `get` needs `storage.local.read`;
  `set`/`delete` need `storage.local.write`, checked on every call. A corrupt file is never
  overwritten: it reports `STORAGE_UNAVAILABLE` and keeps its bytes. Same-namespace
  operations are serialized. Closing one handle does not delete data or affect another
  handle.
- **Message observation.** The scope must appear in the static manifest declaration and
  match exactly, so a subscription never sees another session's content. Only
  `user/message` → `message.received` and `assistant/message` → `message.sent` are mapped;
  streaming chunks, tool events, and boundary events produce nothing. Every envelope passes
  the fixed `@dsh-std/messages` validator, is delivered to each subscriber as an
  independent frozen copy, and is classified `sensitive`. Each callback has a timeout and a
  bounded queue; exceeding either closes that subscription. Delivery is at-most-once with
  no replay, and the broker persists nothing.
- **Effect ledger.** Appends one JSONL record per effect with the lifecycle triple
  (plugin id, activation instance, runtime generation) and the operation
  `create` / `bind` / `replace` / `release` / `cleanup-failed`. Records are built from an
  allowlist and validated against a schema, so secrets and payloads cannot ride along.
  Writing is best-effort and never surfaces an error to the caller.

### 5.1 Permissions

The profile registers eight permission names. Seven default to deny; `commands.invoke`
defaults to allow because it cannot read data passively.

| Permission | Default | Scope |
| --- | --- | --- |
| `storage.local.read` | deny | plugin namespace |
| `storage.local.write` | deny | plugin namespace |
| `commands.invoke` | allow | declared command id |
| `messages.observe.read` | deny | message observation scope |
| `session.input.intercept` | deny | decision event subscription |
| `session.rewind.intercept` | deny | decision event subscription |
| `session.switch.intercept` | deny | decision event subscription |
| `session.compact.intercept` | deny | decision event subscription |

Grants live in `~/.dsh-tui/extension-grants.json`, keyed by verified component id, and each
rule keeps the permission's scope (and may bind an activation). A `denies` section revokes a
default-allow. Three file states stay distinct: **missing** means the defaults apply,
**unparsable** and **unreadable-but-present** both fail closed and deny everything,
including the default-allow. An unregistered permission name is always denied. The store is
read live, so a change takes effect on the next operation and a revocation releases the
associated decision handlers and observer registrations.

## 6. Side panel (`ctx.tuiPanels`)

The terminal sidebar is the profile's richest interactive surface, so its plugin API and the
user-facing operations are documented together.

**Plugin API.** `register({ apiVersion: 1, id, title, icon?, minColumns?, order?, component?,
compact? }, identity?)` returns a cleanup-aware disposer or `undefined`. The host prefixes
the id with the plugin id (`<pluginId>:<id>`), so a panel can never claim another plugin's
name. `list()` returns the caller's own summaries, `open(id)`/`close(id)` act on the caller's
own panels, `badge(id, { level, unread } | null)` sets the panel-bar marker, and
`subscribe(listener)` delivers only events about the caller's own panels.

**What the panel component receives.** Injected props `{ React, ui, host, width, height,
focused, visible, mode }`:

- `ui` — `Box`, `Text`, `Image`, `ScrollBox`, `Divider`, a `useTerminalSize()` pinned to the
  panel's own size, `useAnimationTime(ms)` as the only legal timer source, and a read-only
  `useTheme`. `Box` keeps click, hover, drag, and wheel handlers; focus, keyboard, and
  context-menu props are removed from the type.
- `host` — `snapshot()` (a curated, structurally copied, frozen view: session id, cwd, lang,
  working, spinner mode, channel version, goal, todos, background jobs, subagents, attention
  counts, activity — no transcript body, credentials, or file contents), `focused`,
  `notify(level, unread?)`, `clearBadge()`, `onKey(listener)` (delivered only while focused),
  `focus()`, `openScene(id)` (opens one of the plugin's own full-screen scenes), `toast(text)`,
  `storage` (the plugin's `storage.local` handle), and `sendToChat(payload)`.
- `mode` is `split`, `zoom`, or `fullscreen`; `visible` reports whether this panel is the
  active one.

**Operating the sidebar (user-facing).**

| Operation | Binding |
| --- | --- |
| Three-state toggle: closed → open and focused; chat → panel; panel → closed | `Ctrl+B` |
| Zoom the panel (chat keeps a minimum width) | `Alt+Z` |
| Switch panels | `←`/`→` or `[`/`]`, or clicking the panel-bar arrows and capsules |
| Direct pick by position | `1`…`9` |
| Toggle zoom | `z` |
| Resize by one step | `+`/`=` and `-`/`_` |
| Return focus to chat | `Esc` |
| Focus the panel column | click anywhere in the column |
| Panel chooser / commands | `/panel` (chooser), `/panel toggle｜focus｜zoom｜<id>` |
| Enable, disable, reorder panels | `/settings` → `dsh-tui.sidePanel.panels` |

The split needs full-screen mode and at least 93 content columns (64 chat + 28 panel +
1 divider); in inline mode or below that width the sidebar does not exist, and a plugin
panel has no fallback surface of its own.

**Keyboard contract.** When the panel column has focus, the active panel is asked first
through `host.onKey`; a listener that calls `event.preventDefault()` (or returns `true`)
consumes the key, and only an unconsumed key reaches the host fallbacks above. `Ctrl` and
`Alt` combinations are not delivered to panels; only plain keys and arrow keys are, so a
panel's own shortcuts coexist with the host's reserved set rather than overriding it.

## 7. Version axes

| Axis | Value at this edition | Notes |
| --- | --- | --- |
| Package version | `@deepseek-harness-tui/dsh-tui` `0.13.0` | Product releases; a deprecated alias window is announced in the owner's overview |
| Admission profile version | `dsh-tui-admission-v0.15` | Carried by the profile text and its registry/conformance files |
| Protocol coordinates | `tui.dsh/v1alpha1` (`DecisionEvents`, `Channel`, `SettingsSection`, `Scene`), plus the imported dsh-std coordinates for commands, storage, messages, and presentation | Contract identity is the coordinate, not the package version |
| Per-seam runtime version | `ctx.tuiPanels` `apiVersion = 1`; other seams negotiate by service or method presence | `ctx.get(name, false)` is the portable probe |

## 8. Verification entry points

- Install into a profile and run it in a real terminal: `dsh plugin --profile dsh-tui add <package>`, then `dsh --profile dsh-tui`. Headless assertions are not a substitute for a TTY pass.
- Debug output: `DSH_TUI_DEBUG=1`, `DSH_TUI_RENDER_LOG=…` (stderr paths; the TUI keeps stdout quiet).
- The owner's repository runs the profile's own gates: compile, build verification, package verification, and focused regression scripts (the seam-by-seam checks referenced in the owner's guide).
- Admission review of a package is a static exercise: parse `dsh-plugin.json`, check declaration closure, negotiate against the host descriptor, and confirm the permission set — without running plugin code.

## 9. Staying in sync

This page describes one edition. The owner's text changes with the product code, so when
the carrier revises its interface:

- the owner's text and the profile registry are the source, and this page is updated to match;
- if this page and the owner's text disagree, the owner's text is authoritative and this
  page is the one that gets corrected;
- the edition line at the top is updated with the check-out or release the page was
  reconciled against.

## 10. See also

- [Cross-profile application guide](README.md) — how one package serves several shapes
- [Owner's admission and development guide](https://github.com/ccch1mneyyy/dsh-TUI/blob/main/tui-profile/docs/plugin-admission-and-development.md)
- [Profile root in the carrier repository](https://github.com/ccch1mneyyy/dsh-TUI/tree/main/tui-profile) · [registry](https://github.com/ccch1mneyyy/dsh-TUI/tree/main/tui-profile/registry) · [conformance](https://github.com/ccch1mneyyy/dsh-TUI/tree/main/tui-profile/conformance)
- [Ecosystem plugins and the plugin template](https://github.com/dsh-tui-ecosystem)
- Ecosystem index side: [dsh-ecosystem-spec `profiles/`](https://github.com/T-Auto/dsh-ecosystem-spec/tree/main/profiles)
