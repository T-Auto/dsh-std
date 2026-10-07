# 跨 Profile 应用指南

[English](README.md) | 中文

- 文档类型：应用指南（信息性）
- 状态：随生态 profile 层演进持续修订
- 日期：2026-10-07

本指南说明**一个插件包与可能挂载它的多个 profile 组合之间的关系**，面向插件作者、
Profile 归属方，以及评审与 CI 工具链。

本指南不创建任何协议坐标、不改变任何协议语义：协议语义以
[`docs/proposals/`](../proposals/README.zh.md) 为准，具体 Profile 的要求以该 Profile
归属方的正文为准。

## 1. 为什么"多 profile"是基线

一个运行中的 `dsh` 是启动时按层序组合出来的插件树。**Profile** 是存放在 Harness home
里的**命名组合**：它列出自己堆叠的 bundle、安装的树外插件，以及自己的
`cordis.patch.yml`。DSH 为自己的产品形态随发行提供模板 profile；产品也可以在同一套
机制上增加自己的 profile。

三件对插件作者有直接影响的事实：

- 同一个插件包**可以**被多个 profile 挂载，也可以只被一个挂载，或不被任何 profile 挂载；
- 挂载同一个包的两个 profile **可以**呈现不同的用户界面、不同的交互模型，或完全没有
  用户界面；
- profile 名是**组合输入**，不是协议、不是协商结果，也不是能力声明。**禁止**用 profile
  名代替"声明的 requirement + 协商出的 agreement"。

## 2. 四个近义说法，四件不同的事

生态里"profile"被用来指两件互不相关的事，另有两件与之接近。把它们混为一谈，写出来的
包就只能在作者当时测试过的那一种环境里工作。

| 术语 | 它是什么 | 由谁定义 |
| --- | --- | --- |
| 组合 profile（DSH profile） | `dsh` 进程启动时据以组合的命名组合：bundle、插件与 patch 层 | DSH 产品（随发行的模板），或增加该 profile 的产品/运维方 |
| 产品形态 / realm | 产品呈现的环境类别：终端、浏览器、桌面 GUI，或没有用户界面（headless、SDK、自动化） | 产品 |
| 准入 Profile（Profile 规范） | 某个产品形态在**公共协议之上**额外增加的准入、兼容、证据与披露规则 | 该 Profile 的归属方，落在生态的 profile 层 |
| UI profile | composition 对某类 UI 及其适配 facets 的选择结果——std 用来描述 facet 选择的词汇，不是产品身份 | [`@dsh-std/ui`](../proposals/ui-contribution.zh.md) |

只有最后一项属于 DSH Standard。其余三项属于产品或生态的 profile 层。本指南用
**组合 profile** 指第一项，用**准入 Profile** 指第三项。

## 3. 哪些是共享面，哪些是 Profile 特有面

| 层 | 归属 | 例子 | 插件可以依赖什么 |
| --- | --- | --- | --- |
| 元协议与领域协议 | DSH Standard | 协议坐标、静态 Manifest、协商结果、component/facet/activation 身份、归属与清理规则 | 只有自己的声明与已协商 agreement 覆盖到的部分 |
| 准入 Profile | 该 Profile 的归属方 | 准入要求及其编号、证据与 claim 规则、验证入口、信任披露、Profile 层的呈现约定 | 只有在该 Profile 是既定目标、且其要求被满足时 |
| 产品与运行时 | 产品 | 服务、凭据、存储位置、沙箱与审批策略、文件系统、界面组件 | 只能经声明的 requirement、协商得到的 support，或该产品自己文档化的插件 API |

由这张表直接得出的规则：

- 插件**禁止**把 profile 名、shell 名、surface 名、快捷键、主题 token 或渲染器 API 当作
  标准语义；
- 可移植行为**必须**来自声明的 requirement、协商出的 support 与文档化的降级路径，
  **禁止**来自"我现在跑在哪个 profile 里"；
- 缺失的可选能力**必须**降级而不是失败：包应该仍可加载，不受影响的其他 facet 应该继续
  可用；
- 在某形态下无法满足的要求，应该声明为可选并写明降级行为，让宿主能报出"降级 agreement"
  而不是直接失败。

## 4. 跨 Profile 作者检查表

一个面向生态的包**应该**：

1. **按关注点拆分 facet**——业务逻辑与 UI 代码分属不同 facet，使没有 UI 或 UI 形态不同
   的 profile 仍能激活业务部分；
2. **把"没有用户界面"当作一等目标**——headless、SDK 与自动化都是随发行提供的产品形态，
   不是边角情形；
3. **声明而不假设**——包需要的每项能力都写成 requirement，并在可能时提供可选形式与降级；
4. **运行时软探测**——探测可选服务，缺失即静默降级；可选接缝缺席是正常状态；
5. **一个能力只有一个真源**——同一能力要出现在两种形态时，从同一份状态投影，而不是维护
   两份会漂移的实现；
6. **交互走 presentation 层**——提问、审批、通知、跳转外部资源属于 presentation 协议，
   不属于某个 shell 的私有 API；
7. **描述而不是硬编码 shell 专有面**——形态需要自己的注册面时，用 surface definition
   描述；不要把某个产品的 slot、控件或事件名提升为通用语义；
8. **声明权限并保持可撤销**——不同 profile 的授权可以不同；**禁止**从 profile 名推断
   授权；
9. **把版本轴分开**——包版本、协议 `apiVersion`、Profile 准入版本是三条独立轴；包应该
   写明自己是对着哪一条、在哪里验证的；
10. **按目标形态分别验证**——headless、浏览器与终端是三种不同的验证工作；声称支持多种
    形态的包应该各自有证据。

## 5. 现在该考虑的形态

下表是示例，不是封闭清单。已声明准入 Profile 的权威清单在生态的 profile 层，Profile
名称**可以**变化。

| 形态 | 载体（示例） | 作者应该预期什么 |
| --- | --- | --- |
| 浏览器 shell | DSH 随发行的 `web` 模板 profile | 浏览器 realm 的呈现；UI contribution 可能由浏览器 shell 渲染；没有终端控制序列 |
| 终端 shell | 生态已声明的 TUI 准入 Profile；正文随终端产品自己的仓库分发 | 终端 realm 的呈现；UI 面是终端形态的；交互以按键与文本为主；预期会遇到该 Profile 自己稳定编号前缀的准入检查（本 Profile 为 `TUI-*`） |
| 桌面 GUI | 组合出桌面应用的产品或整合包 | 同一批协议之上的产品自有 shell；预期有它自己的准入与分发规则 |
| 无 UI（headless / SDK / 自动化） | DSH 随发行的 `headless`、`sdk`、`sdk-minimal`、`acp` 模板 profile | 没有 UI facet 被激活；业务 facet **必须**仍完全可用，**禁止**因为某个 UI 要求而阻塞 |

面向生态的插件**应该**至少同时考虑浏览器 shell、终端 shell 与无 UI 三种形态。这三者
齐备，包才是真的可移植，而不只是纸面上可移植。

## 6. 本仓库的 Profile 挂载点

本目录是 DSH Standard **链接** profile 层的地方，不承载准入正文。

- 约定：每个已声明的准入 Profile **可以**在本目录至多有一个页面，命名
  `docs/profiles/<profile-id>.md`，内容包括：Profile id 与名称、产品形态、归属方/载体、
  权威正文位置（固定到具体 revision）、准入版本、验证入口、信任模型，以及面向以它为
  目标的插件的作者指引。
- Profile 的规范性正文**永不**复制到这里；本仓库只登记它在哪里、怎么到达。
- 当前状态：生态的 profile 层已声明一个 TUI 准入 Profile，其正文随终端产品仓库分发
  （[ccch1mneyyy/dsh-TUI](https://github.com/ccch1mneyyy/dsh-TUI)，仓内 `tui-profile/`），
  机器可读的索引条目尚未发布。本仓库目前还没有任何 per-profile 页面。
- 希望在此建页的 Profile 归属方**应该**提供上述字段，并给出权威正文的固定位置。

## 7. 与协议的关系

- 本指南不定义坐标、schema、协商规则，也不对任何项目提出要求。是否采用某个 Profile
  始终是自愿的。
- 若 profile 层将来需要自己的规范性语义，那项工作属于
  [`docs/proposals/`](../proposals/README.zh.md) 下的提案与归属方自己的 Profile，不属于
  本指南。
- Profile 准入要求只约束其归属方声明的生态范围。在本仓库登记或链接某个 Profile，不构成
  背书、不认证实现，也不转移它的归属权。

## 8. 参见

- [架构](../architecture.zh.md)——产品实现从哪里开始
- [`@dsh-std/ui` 提案](../proposals/ui-contribution.zh.md)——profile 选择、facet、contribution 与 surface
- [composition 提案](../proposals/composition.zh.md)——激活规划
- [仓库 README](../../README.zh.md)——分层、可选、非强制的愿景
- 生态 profile 层：[dsh-ecosystem-spec `profiles/`](https://github.com/T-Auto/dsh-ecosystem-spec/tree/main/profiles) 与 [`registry/profiles.json`](https://github.com/T-Auto/dsh-ecosystem-spec/blob/main/registry/profiles.json)
- DSH 产品文档中关于组合 profile 与 bundle 的说明：[deepseek-harness `docs/architecture.zh.md`](https://github.com/deepseek-ai/deepseek-harness/blob/main/docs/architecture.zh.md)
