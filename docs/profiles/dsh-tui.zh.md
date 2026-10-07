# TUI 准入 Profile —— 插件接口

[English](dsh-tui.md) | 中文

- 页面类型：Profile 接口参考（接口清单；准入策略的权威仍在归属方）
- Profile id：`dsh-tui`
- 产品形态：终端 shell（TUI）
- 所述接口版本：`@deepseek-harness-tui/dsh-tui` **0.13.0**（仓库 `main` @ `cf903154`，2026-10-07）
- 归属方 / 载体：[ccch1mneyyy/dsh-TUI](https://github.com/ccch1mneyyy/dsh-TUI)
- 权威准入正文：[`tui-profile/docs/plugin-admission-and-development.md`](https://github.com/ccch1mneyyy/dsh-TUI/blob/main/tui-profile/docs/plugin-admission-and-development.md)

本页是 TUI 准入 Profile 在上述版本下的**完整插件面接口**：子插件能 import 什么、有哪些
服务、每个服务接受与拒绝什么、代价是什么、清理归谁、由哪个权限门把守。因为面向跨 profile
读者，也一并记录了某项服务缺席时该接缝的行为。

**权威说明。** 准入策略仍以归属方正文为准：要求编号、准入判定与 claim 的含义都由它定义。
本页与归属方正文冲突时，以归属方为准，本页负责改到一致。

## 1. 插件的挂载方式

| 方面 | 契约 |
| --- | --- |
| 模块形状 | `export const name`、`export type Config`、`export const Config`（带默认值的 schema）、`export function apply(ctx, config)`；包根不要默认导出 |
| 配置缺失 | 每个键都有默认值（`Schema.…().default(…)` 或 `apply` 里的 `??`）；插件缺失或配置不当应退化为"什么都没发生"，绝不让宿主启动失败 |
| 探测 | 可选服务用 `ctx.get('<service>', false)` 软探测；服务缺席是正常状态而不是错误。随发行 profile 不把它们放进 `inject` |
| 组合 | 包自带 `cordis.patch.yml`（`package.json` 的 `dsh.bundle.patch`）；行按 id 插入或覆盖，覆盖行会**整块替换**目标行的 `config` |
| 静态 Manifest | `dsh-plugin.json`（Community v0.15），由固定 revision 的 `@dsh-std/manifest` 解析；Profile 在其上追加自己的准入检查（编号 `TUI-PKG-*`、`TUI-HOST-*`、`TUI-RUN-*`、`TUI-OBS-*`、`TUI-DEP-*`、`TUI-TRUST-*`） |
| 协商 | 五态——`compatible`、`compatible_degraded`、`waiting_authorization`、`rejected`、`unknown`——按**插件**整体计算（不是按接缝），输入是声明的契约、facet 版本与权限；只有 `compatible` 与 `compatible_degraded` 会被装载 |
| 身份 | 准入后宿主绑定一个已验证的 component 身份（component id + activation instance）。每个服务都从传入的 `ctx` 推导调用者，**没有**可以指名别的插件的参数 |
| 信任模型 | `trusted-in-process`：权限是兼容性、披露与审计约束，不是隔离边界 |

### 1.1 入口子路径

| 子路径 | 性质 | 内容 |
| --- | --- | --- |
| `.` | 值 | Cordis 插件工厂 |
| `./extensions` | 值 + 类型 | 托管扩展服务（dialogs、status、shortcuts、renderers、toast、themes） |
| `./scenes` | 值 + 类型 | 全屏场景注册表 |
| `./panels` | 值 + 类型 | 侧栏 Panel 注册表 |
| `./settings-sections` | 值 + 类型 | 声明式 `/settings` 区块 |
| `./command-trees` | 值 + 类型 | 命令补全 provider |
| `./workspaces` | 值 + 类型 | 工作区 provider |
| `./plugin-host` | 值 + 类型 | 准入锚点：generation、grants、storage、消息观察、效果台账、命令归属 |
| `./api` | 类型（+1 个常量） | 策展的接缝类型。它还导出运行时常量 `TUI_PANEL_API_VERSION`，所以并不是字面意义的 types-only |
| `./jsx-runtime` | 值 | 面向场景/Panel 作者的宿主 React JSX runtime 再导出 |
| `./working-activity` | 值 | 随包的活动状态行插件，以子路径再导出，便于 profile 按子路径挂载 |
| `./oauth`、`./invariant`、`./settings.json`、`./cordis.patch.yml` | 值/资产 | 产品支撑入口，不属于本页描述的子插件接口 |

## 2. 宿主产品提供的接缝

这些来自底层的 DSH 产品而不是 TUI Profile，Profile 只是消费它们。

| 接缝 | 形式 | 作者需要知道的 |
| --- | --- | --- |
| 会话事件 | `ctx.on('session/event' \| 'agent/status' \| 'session/disposed', …)` | 持久化会话日志是真源。插件**可以**追加自己的事件类型，但随之有两条规则：事件是 log-only（没有 `surfaceOp`）；类型必须写进每个可达 `dsh-session` 副本的 `KNOWN_SESSION_EVENT_TYPES`，否则该会话在本 profile 之外会无法 resume |
| prompt 槽位 | `ctx.tuiPrompt` | 它由**产品官方 TUI 宿主**提供，本 profile 不提供。只注册槽位的插件在这里是静默无效的——可移植的写法是双出口（槽位给官方宿主，log-only 事件给本 profile 与其他消费者） |
| 技能打包 | `skills/<name>/SKILL.md` + skills 注册表 | 静态资产、零代码；无效或重复条目被跳过，而不是让宿主失败 |
| 静态主题 | `~/.dsh-tui/themes/<name>.json` | 多色调 JSON，含 `base` 与部分 `colors`；未知键与非法颜色被跳过，文件损坏则整体丢弃 |
| system prompt 段 | `ctx.inject(['systemPrompt'], …)` → `section({ name, order, text })` | 会进入每个请求并影响 KV 缓存稳定性；只注入必须稳定的内容 |
| profile 组合 | 包自己的 `cordis.patch.yml` | 行序有意义；不要重复挂 base profile 已经挂过的行 |

## 3. 托管扩展服务（`dsh-tui-extensions` 行）

该行挂载六个服务。它们的共同点：拒绝时只告警不抛错（例外在表中标注）、从 `ctx` 推导调用者、
返回的 disposer 自动绑到调用者 activation，并在传入 `identity` 参数时把效果记入台账。

| 服务 | 入口 | 版本机制 | 拒绝返回 | 配额 | 清理 |
| --- | --- | --- | --- | --- | --- |
| `ctx.tuiScenes` | `./scenes` | 契约坐标 `tui.dsh/v1alpha1#Scene`；没有 `apiVersion` 字段 | id 非法/重复、root 调用者、身份不属于同一 activation 时**抛错**；`open()/close()` 告警并返回 `false` | 无 | 自动绑到调用者 activation；dispose 会关闭已打开的场景 |
| `ctx.tuiDialogs` | `./extensions` | 无 | `select` → `undefined`，`confirm` → `false`，`input` → `undefined`；畸形请求按"取消"结算，从不抛错（shadow 模式除外） | 标题/标签 ≤120 cell、message ≤400、输入 ≤500、选项 ≤100 个；默认超时 30 s，钳到 ≤24 h | 调用者失活时，排队中与进行中的对话框都按取消结算 |
| `ctx.tuiStatus` | `./extensions` | 无；`registerView` 以"方法是否存在"协商 | `set` → noop disposer；`registerView` → `undefined` | 20 个 key；文本 ≤200 cell；富视图 1–3 行、聚合 6 行 | 文本 disposer 带值守卫；视图在 dispose 时清除；两者都自动绑定 |
| `ctx.tuiShortcuts` | `./extensions` | 无；保留位现取，用户改键会随之移动 | noop disposer | 无 | 自动绑定；handler 抛错会转成 toast |
| `ctx.tuiRenderers` | `./extensions` | 无；内建事件词表在模块加载时冻结 | noop disposer | 输出 ≤100 行、每行 ≤400 cell、标题 ≤120 cell；每种事件类型只告警一次 | 自动绑定 |
| `ctx.tuiToast` | `./extensions` | 无（归属方速览里标为实验性） | 输入非法、被限速、或无交付通道时返回 `false` | 文本 ≤200 cell；超时钳到 500–12 000 ms；**每 activation 每分钟 20 次** | 无清理责任；toast 是瞬态显示 |
| `ctx.tuiThemes` | `./extensions` | 无 | noop disposer；描述符里只要有一个非法颜色就整体拒绝 | 128 个运行时主题；显示名 ≤120 cell；内建主题名保留 | 自动绑定；teardown 时释放宿主 resolver |

采用之前值得知道的行为：

- **Scenes** 是全屏面。场景组件通过 props 拿到宿主 `React` 与 `ui` kit；hook 与 JSX 必须走它们
  （`jsxImportSource` 指向本包）。渲染期异常会被接住并关闭场景；effect 与异步回调里的异常仍是
  场景自己的责任。打开场景不触碰会话日志。
- **Dialogs** FIFO 排队、一次一个。`select` 选项的 `id` 是不透明 token：只做类型与非空校验、
  原样返回，**不做消毒**。
- **Status** 的 `set` 与 `registerView` 共享同一 key 命名空间。文本形态是纯展示；富形态支持
  指针事件，并且每个 key 有独立 error boundary。
- **Shortcuts** 必须带 `ctrl` 或 `alt`，不得与内建绑定冲突，并且只在纯对话态派发——任何浮层、
  选择器、对话框或场景打开期间键盘归它们。`escape` 组合一律被拒：这条终端输入路径上每个 Esc
  都带 `meta`。
- **Renderers** 把插件追加的 log-only 事件类型映射成纯文本行。它们刻意拿不到 React：transcript
  行也会走回放路径，那里一次崩溃会毁掉整个屏幕。
- **Toasts** 是发后不管的显示；`sticky` 是宿主专用能力，被限速的调用者只被告知一次，之后静默丢弃。

## 4. 各自独立行的资源服务

| 服务 | 行 | 入口 | 版本机制 | 拒绝返回 | 配额 / 限制 | 归属 |
| --- | --- | --- | --- | --- | --- | --- |
| `ctx.tuiSettingsSections` | `dsh-tui-settings-sections` | `./settings-sections` | 契约坐标 `tui.dsh/v1alpha1#SettingsSection`；运行时 `register()` 并不校验该 descriptor 字段 | 命名空间重复或组未声明时抛错；其余为声明式 | 注册期没有字段数、选项数或文本长度上限 | 读取与事件都按调用者自己的区块过滤 |
| `ctx.tuiCommandTrees` | `dsh-tui-command-trees` | `./command-trees` | 无 | root 非法或重复时抛错 | 对 provider 返回值无限制 | 每个调用者只读自己的 root |
| `ctx.tuiWorkspaces` | `dsh-tui-workspaces` | `./workspaces` | provider scheme；profile 映射的坐标已 superseded | provider 调用有 2 s 预算并降级；按 owner 的读取只返回调用者自己的 provider | 无 provider 数量或 scheme 冲突检查 | 变更类操作要求调用者自己的 provider 为该路径背书 |
| `ctx.tuiPanels` | `dsh-tui-panels` | `./panels` | **`apiVersion: 1`，必须精确匹配** | `register` → `undefined`；`open/close/badge` → `false`；`subscribe` → noop disposer | 每插件 ≤4 个、全局 ≤32 个；`open` 每插件 5 s 内至多 1 次；60 s 内崩溃 3 次则本会话禁用该面板 | 每个变更方法都校验注册时的 activation；外来 id 被拒 |

**设置区块**是声明式的：插件描述可编辑字段（`text` / `number` / `boolean` / `select`，以及用于
凭据的 `secret: { ref }`），渲染、草稿编辑、保存/放弃、revision 冲突重试都由宿主负责。带 secret
引用的字段永不进入 settings 文档。

**命令树**扩展命令补全：provider 在自己的某个命令 root 下贡献 children 与 descriptions。provider
抛错只导致空列表，不会阻塞命令执行。

**工作区**让插件认领一个 scheme：目标、选项、命令与 shell 执行都由 provider 描述；没有 provider
挂载时，运行时会回落到本地实现。

**Panels** 是终端侧栏，见 §6。

## 5. 准入与信任服务（`dsh-tui-plugin-host` 行）

| 服务 | 入口 | 插件拿到什么 |
| --- | --- | --- |
| `ctx.tuiPluginHost` | `./plugin-host` | `generationId`（每次行激活一个新值）、调用者安全的 `grants` 门面（`allows`、`defaultOf`、`knownPermissions`、`onChange`）、只读的 `probeDecisionEvents()`、`selfCheck()`、`registerCommand(pluginCtx, definition)`，以及 `subscribeDecision(pluginCtx, event, listener, { scope, order })` |
| `ctx.tuiPluginStorage` | `./plugin-host` | `open(ctx)` → `{ get, set, delete }`（`storage.local`）；命名空间由已验证的 component 身份派生 |
| `ctx.tuiMessageObserver` | `./plugin-host` | `subscribe(ctx, listener, { scope })`（`messages.observe`） |
| `ctx.tuiEffectLedger` | `./plugin-host` | `record(entry, identity?)`，追加式，从不抛错 |

- **命令归属。** `registerCommand` 把已验证的 component 印在定义上并返回 disposer；重复注册映射为
  契约错误码 `DUPLICATE_CONTRIBUTION_ID`。直调命令服务注册、没有归属印的定义不进检查点。
- **决策事件。** 订阅需要私有契约 `tui.dsh/v1alpha1#DecisionEvents` 与该事件对应的授权。事件名共
  六个：`tui/input`、`tui/rewind-prompt`、`tui/rewind-done`、`tui/session-switch`、
  `tui/session-switched`、`tui/compact`。决策点按序逐个 await：第一个有效决策生效，畸形返回算
  无意见，抛错或超时的 handler 被跳过（单 handler 1 s、总计 5 s）。通知类事件事后广播、无决策权。
- **Storage。** key 非空、≤128 字符、无控制字符。值必须是**精确 JSON 值**：`undefined`、
  `NaN`/`Infinity`、函数、Symbol、`BigInt`、类实例、稀疏数组、环都会被拒绝，而不是被悄悄变形。
  配额为每个命名空间 256 键 / 256 KiB。`get` 需要 `storage.local.read`，`set`/`delete` 需要
  `storage.local.write`，每次调用现查。损坏文件永不覆盖：报 `STORAGE_UNAVAILABLE` 并保留原字节。
  同命名空间操作串行。关闭一个 handle 不删数据、也不影响另一个 handle。
- **消息观察。** scope 必须出现在静态 Manifest 声明中且精确匹配，因此订阅看不到别的会话内容。
  只映射 `user/message` → `message.received` 与 `assistant/message` → `message.sent`；流式 chunk、
  工具与边界事件不产出。每条 envelope 过固定 `@dsh-std/messages` validator，向每个订阅者投递独立
  的冻结副本，privacyClass 为 `sensitive`。每个 callback 有超时与有界队列，超出即关闭该订阅。投递
  at-most-once、无重放，broker 零持久化。
- **效果台账。** 每个效果追加一条 JSONL，带生命周期三元组（plugin id、activation instance、
  runtime generation）与操作 `create` / `bind` / `replace` / `release` / `cleanup-failed`。记录按
  allowlist 构造并过 schema 校验，秘密材料与 payload 夹带不进去。写入是尽力而为，永不把错误抛给
  调用方。

### 5.1 权限

Profile 注册八个权限名。七个默认拒绝；`commands.invoke` 默认允许，因为它无法被动读取数据。

| 权限 | 默认 | 范围 |
| --- | --- | --- |
| `storage.local.read` | 拒绝 | 插件命名空间 |
| `storage.local.write` | 拒绝 | 插件命名空间 |
| `commands.invoke` | 允许 | 声明的命令 id |
| `messages.observe.read` | 拒绝 | 消息观察 scope |
| `session.input.intercept` | 拒绝 | 决策事件订阅 |
| `session.rewind.intercept` | 拒绝 | 决策事件订阅 |
| `session.switch.intercept` | 拒绝 | 决策事件订阅 |
| `session.compact.intercept` | 拒绝 | 决策事件订阅 |

授权文件是 `~/.dsh-tui/extension-grants.json`，按已验证 component id 键控，每条规则保留该权限的
scope（并可绑定 activation）；`denies` 段可撤销默认允许。文件三种状态严格区分：**缺失**表示按默认
值，**不可解析**与**存在但读不了**都 fail closed，连默认允许也一并拒绝。未注册的权限名一律拒绝。
存储是实时读取的：改动在下一次操作即生效，撤销会释放关联的决策 handler 与观察订阅。

## 6. 侧栏（`ctx.tuiPanels`）

终端侧栏是本 profile 最丰富的交互面，因此把插件 API 与用户操作放在一起写。

**插件 API。** `register({ apiVersion: 1, id, title, icon?, minColumns?, order?, component?,
compact? }, identity?)` 返回 cleanup-aware 的 disposer 或 `undefined`。宿主给 id 自动加插件前缀
（`<pluginId>:<id>`），因此面板无法冒用别的插件名。`list()` 返回调用者自己的摘要，
`open(id)`/`close(id)` 只作用于自己的面板，`badge(id, { level, unread } | null)` 设置面板条标记，
`subscribe(listener)` 只投递与调用者自己面板有关的事件。

**面板组件拿到的 props** 是 `{ React, ui, host, width, height, focused, visible, mode }`：

- `ui`——`Box`、`Text`、`Image`、`ScrollBox`、`Divider`，绑定为面板自身尺寸的 `useTerminalSize()`，
  唯一合法定时源 `useAnimationTime(ms)`，以及只读 `useTheme`。`Box` 保留点击、悬停、拖拽与滚轮，
  类型上剔除了焦点、键盘与上下文菜单。
- `host`——`snapshot()`（策展、结构拷贝、冻结的视图：session id、cwd、lang、working、spinner
  mode、channel version、goal、todos、backgroundJobs、subagents、attention 计数、activity；
  **不含**转录正文、凭据与文件内容）、`focused`、`notify(level, unread?)`、`clearBadge()`、
  `onKey(listener)`（仅聚焦期间投递）、`focus()`、`openScene(id)`（打开自己注册的全屏场景）、
  `toast(text)`、`storage`（自己的 `storage.local` 句柄）、`sendToChat(payload)`。
- `mode` 为 `split`、`zoom` 或 `fullscreen`；`visible` 表示该面板当前是否活动面板。

**操作侧栏（用户面）：**

| 操作 | 绑定 |
| --- | --- |
| 三态切换：关 → 开并聚焦；聊天 → 面板；面板 → 关闭 | `Ctrl+B` |
| 缩放面板（聊天列保留最小宽度） | `Alt+Z` |
| 切换面板 | `←`/`→` 或 `[`/`]`，以及点击面板条箭头与胶囊 |
| 按序号直选 | `1`…`9` |
| 缩放开关 | `z` |
| 按步调宽 | `+`/`=` 与 `-`/`_` |
| 焦点交还聊天 | `Esc` |
| 聚焦面板列 | 点击该列任意处 |
| 面板选择器 / 命令 | `/panel`（选择器）、`/panel toggle｜focus｜zoom｜<id>` |
| 启用、停用、排序面板 | `/settings` → `dsh-tui.sidePanel.panels` |

分栏需要全屏模式且内容宽至少 93 列（64 聊天 + 28 面板 + 1 分隔）；inline 模式或窄于此宽度时侧栏
不存在，而插件面板没有自己的回退面。

**键盘契约。** 焦点在面板列时，先问活动面板（`host.onKey`）：listener 调
`event.preventDefault()`（或返回 `true`）即消费该键，未被消费的键才轮到上面的宿主回退。
`Ctrl` 与 `Alt` 组合不会投递给面板，只投递裸键与方向键，因此面板自己的快捷键与宿主保留位共存
而不是覆盖它。

## 7. 版本轴

| 轴 | 本版本取值 | 说明 |
| --- | --- | --- |
| 包版本 | `@deepseek-harness-tui/dsh-tui` `0.13.0` | 产品发布；归属方速览里会公告弃用别名窗口 |
| 准入 Profile 版本 | `dsh-tui-admission-v0.15` | 由 Profile 正文与其 registry/conformance 文件承载 |
| 协议坐标 | `tui.dsh/v1alpha1`（`DecisionEvents`、`Channel`、`SettingsSection`、`Scene`），加上导入的 dsh-std 坐标（commands、storage、messages、presentation） | 契约身份是坐标，不是包版本 |
| 接缝级运行期版本 | `ctx.tuiPanels` 的 `apiVersion = 1`；其余接缝按服务或方法是否存在协商 | `ctx.get(name, false)` 是可移植的探测方式 |

## 8. 验证入口

- 装进 profile 并在真实终端里跑：`dsh plugin --profile dsh-tui add <package>`，然后 `dsh --profile dsh-tui`。无头断言不能替代 TTY 实测。
- 调试输出：`DSH_TUI_DEBUG=1`、`DSH_TUI_RENDER_LOG=…`（都是 stderr 路径；TUI 期间 stdout 保持安静）。
- 归属方仓库跑它自己的门禁：编译、构建校验、包校验，以及一组聚焦回归脚本（逐接缝的检查见归属方指南）。
- 对一个包做准入评审是静态工作：解析 `dsh-plugin.json`、检查声明闭包、对宿主 descriptor 协商、确认权限集合——不需要运行插件代码。

## 9. 如何保持同步

本页描述的是一个版本。归属方正文随产品代码变化，所以当载体修订接口时：

- 以归属方正文与 Profile registry 为准，本页跟着改到一致；
- 本页与归属方正文不一致时，归属方为准，改的是本页；
- 顶部那行"所述接口版本"要更新为本次对照过的 checkout 或发布版本。

## 10. 参见

- [跨 Profile 应用指南](README.zh.md)——同一个包如何服务多种形态
- [归属方的准入与开发指南](https://github.com/ccch1mneyyy/dsh-TUI/blob/main/tui-profile/docs/plugin-admission-and-development.md)
- [载体仓库中的 Profile 根目录](https://github.com/ccch1mneyyy/dsh-TUI/tree/main/tui-profile) · [registry](https://github.com/ccch1mneyyy/dsh-TUI/tree/main/tui-profile/registry) · [conformance](https://github.com/ccch1mneyyy/dsh-TUI/tree/main/tui-profile/conformance)
- [生态插件与插件模板](https://github.com/dsh-tui-ecosystem)
- 生态索引侧：[dsh-ecosystem-spec `profiles/`](https://github.com/T-Auto/dsh-ecosystem-spec/tree/main/profiles)
