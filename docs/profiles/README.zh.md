# 跨 Profile 应用指南

[English](README.md) | 中文

- 文档类型：应用指南（描述性，不是规范性文本）
- 状态：随生态 profile 层演进持续修订
- 日期：2026-10-07

DSH 是一个多 profile 系统：同一个插件包可能被不止一个产品组合挂载。本文档就是从这个
需求出发写的。它描述的是——当同一个包要在浏览器 shell、终端 shell、桌面 shell，或者
完全没有界面的形态里都工作时，插件作者通常会遇到什么；同时它也是本仓库链接 profile
层的地方。

本文刻意保持描述性：它不定义坐标、不增加要求、不约束任何项目。协议语义以
[`docs/proposals/`](../proposals/README.zh.md) 为准，具体 Profile 的要求以该 Profile
归属方的正文为准。

## 1. 多 profile 是基线

一个运行中的 `dsh` 是启动时按层序组合出来的插件树。**Profile** 是存放在 Harness home
里的**命名组合**：它列出自己堆叠的 bundle、安装的树外插件，以及自己的
`cordis.patch.yml`。DSH 为自己的产品形态随发行提供模板 profile；产品也可以在同一套
机制上增加自己的 profile。

由此有三点观察，它们在日常插件工作里都会出现：

- 同一个插件包可以被多个 profile 挂载，也可以只被一个挂载，或不被任何 profile 挂载；
- 挂载同一个包的两个 profile，可以呈现不同的用户界面、不同的交互模型，或完全没有界面；
- profile 名是**组合输入**。它不是协议、不是协商结果，也不是能力声明：一个包能依赖
  什么，仍然来自它自己声明了什么、宿主协商出了什么。

## 2. 四个近义说法，四件不同的事

生态里"profile"被用来指两件互不相关的事，另有两件与之接近。把它们分开，基本就是跨
profile 工作的主要内容。

| 术语 | 它是什么 | 由谁定义 |
| --- | --- | --- |
| 组合 profile（DSH profile） | `dsh` 进程启动时据以组合的命名组合：bundle、插件与 patch 层 | DSH 产品（随发行的模板），或增加该 profile 的产品/运维方 |
| 产品形态 / realm | 产品呈现的环境类别：终端、浏览器、桌面 GUI，或没有界面（headless、SDK、自动化） | 产品 |
| 准入 Profile（Profile 规范） | 某个产品形态在公共协议之上额外增加的准入、兼容、证据与披露规则 | 该 Profile 的归属方，落在生态的 profile 层 |
| UI profile | composition 对某类 UI 及其适配 facets 的选择结果——描述 facet 选择的标准词汇，不是产品身份 | [`@dsh-std/ui`](../proposals/ui-contribution.zh.md) |

只有最后一项属于 DSH Standard。其余三项属于产品或生态的 profile 层。本指南用
**组合 profile** 指第一项，用**准入 Profile** 指第三项。

## 3. 共享面与 Profile 特有面

| 层 | 归属 | 例子 | 插件看到什么 |
| --- | --- | --- | --- |
| 元协议与领域协议 | DSH Standard | 协议坐标、静态 Manifest、协商结果、component/facet/activation 身份、归属与清理规则 | 自己声明的 requirement 与协商出的 agreement |
| 准入 Profile | 该 Profile 的归属方 | 准入要求及其编号、证据与 claim 规则、验证入口、信任披露、Profile 层的呈现约定 | 当该 Profile 是既定目标时额外适用的条件 |
| 产品与运行时 | 产品 | 服务、凭据、存储位置、沙箱与审批策略、文件系统、界面组件 | 产品自己文档化的部分，加上上两层里已协商到的部分 |

按作者通常遇到的顺序列几条实际影响：

- profile 名、shell 名、surface 名、快捷键、主题 token、渲染器 API 都是产品词汇；
  靠它们分支的代码，往往只在某一种环境里成立。
- 可移植行为来自声明的 requirement、协商出的 support 与文档化的降级路径，而不是来自
  "探测到自己在哪个 profile 里"。
- 可选能力缺席是正常状态而不是失败：安静降级能让包继续可加载，不受影响的部分继续可用。
- 在某种形态下无法满足的能力，通常会声明为可选并写明降级行为，让宿主报出"降级
  agreement"而不是硬失败。

## 4. 比较容易跨形态成立的做法

下面这些习惯，通常能让同一个包在多种形态里都工作：

1. **按关注点拆分 facet**——业务逻辑与 UI 代码分属不同 facet，使 UI 形态不同或没有 UI
   的 profile 仍能激活业务部分；
2. **把"没有界面"当作一等目标**——headless、SDK 与自动化都是随发行提供的产品形态，不是
   边角情形；
3. **声明而不假设**——把包需要的东西写成 requirement，存在可选形式时就写成可选；
4. **运行时软探测**——探测可选服务，缺失时安静降级；可选接缝缺席是正常状态；
5. **一个能力只有一个真源**——同一能力要出现在两种形态时，从同一份状态投影，而不是维护
   两份会漂移的实现；
6. **交互走 presentation 层**——提问、审批、通知、跳转外部资源属于 presentation 协议，
   而不是某个 shell 的私有 API；
7. **描述而不是硬编码 shell 专有面**——形态需要自己的注册面时，用 surface definition
   描述；某个产品的 slot、控件或事件名保持它自己的词汇；
8. **授权保持协商而来**——不同 profile 的授权可以不同，授权来自协商结果，而不是 profile 名；
9. **把版本轴分开**——包版本、协议 `apiVersion`、Profile 准入版本是三条独立轴；写清
   自己是对着哪一条、在哪里验证的会有帮助；
10. **按目标形态分别验证**——headless、浏览器与终端是三种不同的验证工作；声称支持多种
    形态的包，各自有证据会更有说服力。

## 5. 现在该考虑的形态

下表是示例，不是封闭清单。已声明准入 Profile 的权威清单在生态的 profile 层，Profile
名称也可能变化。

| 形态 | 载体（示例） | 可以预期什么 |
| --- | --- | --- |
| 浏览器 shell | DSH 随发行的 `web` 模板 profile | 浏览器 realm 的呈现；UI contribution 可能由浏览器 shell 渲染；没有终端控制序列 |
| 终端 shell | 生态已声明的 TUI 准入 Profile，链接见 [dsh-tui.zh.md](dsh-tui.zh.md)；正文随终端产品自己的仓库分发 | 终端 realm 的呈现；UI 面是终端形态的；交互以按键与文本为主；准入检查使用该 Profile 自己的稳定编号前缀（`TUI-*`） |
| 桌面 GUI | 组合出桌面应用的产品或整合包 | 同一批协议之上的产品自有 shell，有自己的准入与分发规则 |
| 无界面（headless / SDK / 自动化） | DSH 随发行的 `headless`、`sdk`、`sdk-minimal`、`acp` 模板 profile | 没有 UI facet 被激活；业务 facet 要能自己成立，UI 要求写成可选就不至于挡住它们 |

希望在整个生态里都能用的插件，通常会至少按浏览器、终端、无界面三种形态来设计。这三者
齐备，包才是实际可移植，而不只是纸面上可移植。

## 6. 本仓库的 Profile 页面

本目录是 DSH Standard **链接** profile 层的地方，不承载准入正文。

- 每个已声明的准入 Profile 在这里至多有一个页面，命名 `docs/profiles/<profile-id>.md`。
  页面是指针：Profile id、产品形态、归属方/载体，以及指向权威正文的超链接。
- 权威正文留在归属方手里。链接指向归属方的当前版本，因此归属方在写产品代码时随时可以
  修订 Profile，不需要在这里再改一次；更早的版本由归属方自己的 git 历史承担。
- 因此页面保持简短，并且刻意不复述准入版本、要求编号、接缝清单、权限名或验证步骤——
  那些归属方已经写了。
- 已挂载页面：[dsh-tui.zh.md](dsh-tui.zh.md)——TUI 准入 Profile。
- 机器可读的一侧在生态的 profile 层：归属方发布索引条目后，Profile 就能在那里被登记。

## 7. 与协议的关系

- 本指南不定义坐标、schema 与协商规则，也不对任何项目设定要求。是否采用某个 Profile
  始终自愿。
- 若 profile 层将来需要自己的规范性语义，那项工作属于归属方的 Profile，以及
  [`docs/proposals/`](../proposals/README.zh.md) 下的提案，而不属于本指南。
- Profile 准入要求约束的是其归属方声明的生态范围。在这里链接某个 Profile，不构成背书、
  不认证实现，也不转移它的归属权。

## 8. 参见

- [TUI 准入 Profile（链接页）](dsh-tui.zh.md)
- [架构](../architecture.zh.md)——产品实现从哪里开始
- [`@dsh-std/ui` 提案](../proposals/ui-contribution.zh.md)——profile 选择、facet、contribution 与 surface
- [composition 提案](../proposals/composition.zh.md)——激活规划
- [仓库 README](../../README.zh.md)——分层、可选、非强制的愿景
- 生态 profile 层：[dsh-ecosystem-spec `profiles/`](https://github.com/T-Auto/dsh-ecosystem-spec/tree/main/profiles) 与 [`registry/profiles.json`](https://github.com/T-Auto/dsh-ecosystem-spec/blob/main/registry/profiles.json)
- DSH 产品文档中关于组合 profile 与 bundle 的说明：[deepseek-harness `docs/architecture.zh.md`](https://github.com/deepseek-ai/deepseek-harness/blob/main/docs/architecture.zh.md)
