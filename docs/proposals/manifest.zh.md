# `@dsh-std/manifest` 组件设计

- 文档类型：设计提案
- 状态：方向已确认，格式草案
- 设计版本：v2
- 日期：2026-10-10
- 初版：v1（2026-08-20）

## 职责

`@dsh-std/manifest` 为 std 内部提供统一的组件声明，以及检查这些声明的工具。它接收上游整理好的组件信息，检查数据结构，再按照上游提供的规则校验具体内容，供后续编排和激活使用。

这里的组件声明描述一个组件的身份、组成部分，以及各部分启动时需要的入口、协议和权限。Loader 或 Adapter 负责取得这些信息；manifest 将它们组织为 `ComponentManifest`，使 composition 和 lifecycle 可以使用同一种数据结构。

## 上游提供什么

调用方提供三类输入：

| 输入 | 内容 | 用途 |
| --- | --- | --- |
| 组件声明 | 组件名称、版本、各部分的启动方式与需求 | 描述待编排的组件 |
| 内容校验规则 | 激活声明和扩展声明各自的字段规则 | 检查声明中的具体内容 |
| 协议目录 | core 的 `ProtocolCatalog`，记录当前认识的协议 | 检查声明引用的协议是否已在目录中登记 |

组件声明可以由上游直接构造，也可以由本包从支持的包描述格式转换而来。manifest 按声明的数据结构进行处理。

内容校验规则由相应协议包或集成方提供，调用方将它们注册到 `ManifestDefinitionCatalog`。这个目录分别保存激活规则和扩展规则，以 `apiVersion` 与 `kind` 共同定位一条规则：前者标识协议及其版本，后者标识该协议中的对象类型。

协议目录是可选输入。调用方提供它时，manifest 会检查各项协议引用能否被目录识别。

## 组件声明如何组织

`ComponentManifest` 包含组件身份和组件内容两部分。身份放在 `metadata` 中，包含名称、版本和可选的显示名称；内容放在 `spec` 中，包含 facets 和组件之间的关系。

Facet 是组件中分别描述启动方式与需求的部分。一个组件可以有多个 facet，每个 facet 在组件内有自己的名称，并可以包含以下声明：

| 声明 | 字段 | 描述的内容 |
| --- | --- | --- |
| 激活 | `activation` | 使用哪种激活方式，以及该方式需要的启动参数 |
| 协议需求与支持 | `protocols.requires`、`protocols.supports` | 该部分需要哪些协议，以及声明支持哪些协议 |
| 扩展 | `extensions` | 该部分准备提供的功能及其配置 |
| 权限请求 | `permissions` | 该部分申请的操作权限及相关参数 |

激活声明和扩展声明都用 `apiVersion`、`kind` 指定对象类型，用 `spec` 保存该类型的具体内容。扩展声明还用 `metadata` 保存名称和标签。manifest 检查这些对象的共同结构，注册的校验规则解释各自的 `spec`。

组件之间的关系放在 `spec.relationships` 中，包含依赖、推荐、冲突和破坏关系。每项关系通过组件名称与版本范围描述目标，供 composition 编排组件时使用。

组件必须（MUST）包含至少一个 facet；facet 名称在组件内必须（MUST）唯一。每个 facet 必须（MUST）包含激活、协议、扩展或权限声明中的至少一类。声明中的具体参数必须（MUST）使用 JSON 数据。

## 校验如何进行

### 检查共同结构

`validateComponentManifest()` 检查组件与 facet 的字段结构、名称和版本格式、协议坐标、各类声明中的重复项，以及组件关系的版本范围。

`defineComponentManifest()` 在完成同样的检查后，复制并冻结声明，返回供后续处理使用的对象。

结构不符合要求时，这两个接口抛出 `TypeError`，错误消息说明出错的字段和原因。

### 按注册规则检查内容

`ManifestDefinitionCatalog.validate()` 接收组件声明，先检查共同结构，再逐个检查 facet 中的内容：

1. 对激活声明，按坐标查找激活规则，调用其 `validateSpec()` 检查启动参数。
2. 对扩展声明，按坐标查找扩展规则，调用其 `validateMetadata()`（如有）和 `validateSpec()` 检查名称、标签与配置。
3. 调用方提供协议目录时，用 `ProtocolCatalog.understands()` 检查协议需求和支持声明中的坐标。

校验规则通过 `ManifestObjectDefinition` 提供。其中 `validateSpec()` 是必需的方法，`validateMetadata()` 是扩展规则可选的方法。规则检查通过时正常返回，失败时抛出错误；manifest 将错误汇入校验报告，声明内容保持原样。

目录的 `registerActivation()` 和 `registerExtension()` 分别登记两类规则，并返回用于撤销本次登记的函数。同一类规则中的坐标必须（MUST）唯一。

### 汇总校验结果

内容校验返回 `ManifestValidationReport`，包含组件名称与版本、校验器名称与版本、来源、摘要和问题列表。调用方可以提供来源与摘要；省略时，来源为 `memory:`，摘要根据组件声明生成。

每个问题记录类别 `code`、级别 `severity`、字段路径 `path` 和说明 `message`。当前问题分为两组：

| 级别 | 情况 | 类别 |
| --- | --- | --- |
| `warning` | 找不到激活或扩展规则，或协议目录不认识某个坐标 | `unknown-activation`、`unknown-extension`、`unknown-protocol` |
| `error` | 已注册的激活或扩展规则检查失败 | `invalid-activation`、`invalid-extension` |

报告的 `compatible` 表示本次校验是否没有 `error`；只有警告时该字段仍为 `true`。调用方据此读取校验结果并安排后续处理。

## 如何交给下游

组件声明与校验报告是两份输出。声明保存组件内容，报告保存本次检查结果，调用方分别将它们交给需要的内部模块。

| 对接模块 | 使用的内容 | 承接的工作 |
| --- | --- | --- |
| composition | 组件身份、facets、组件关系和协议声明 | 组织待激活的组件，形成激活计划 |
| lifecycle | 计划中的 facet、激活声明和扩展声明 | 执行激活，管理实例及其注册项的生命周期 |
| Adapter | 组件声明和校验报告 | 串联校验、编排与激活，将组件能力接入产品 |

权限请求随 facet 交给后续权限决策环节；协议需求与支持声明随 facet 交给后续协商环节。

本包还提供 `findFacet()` 查找 facet，`facetIdentity()` 和 `facetKey()` 生成包含组件名称、版本与 facet 名称的身份标识，供这些模块定位同一份声明。`matchesExtensionPublicationName()` 用扩展的局部名称或保留的完整贡献标识匹配扩展，供激活时关联注册项。

## 包描述如何进入内部模型

本包支持 [DSH 社区互操作草案 v0.15](https://github.com/deepseek-ai/deepseek-harness/discussions/2714) 定义的 `dsh-plugin.json` 格式，以下称为 v0.15 格式。这层接口将包描述转换为内部组件声明：

| 接口 | 输入与结果 |
| --- | --- |
| `parseManifest()` | 解析 JSON 文本，校验后返回规范化的 `PluginManifest` |
| `validateManifest()` | 检查包描述对象的格式 |
| `defineManifest()` | 校验、补齐空容器，复制并冻结包描述对象 |
| `projectManifest()` | 将包描述对象转换为 `ComponentManifest` |

`manifestVersion` 选择格式版本；当前支持 `0.15`。`$schema` 使用绝对 URI。本包随包导出的 JSON Schema 路径为 `@dsh-std/manifest/schema/dsh-plugin-0.15.schema.json`。

规范化时，省略的 `requires.contracts`、`permissions`、`contributes.commands` 和 `subscriptions` 被补为空容器。

v0.15 转换产生一个 `host` facet：包的身份形成组件身份，入口形成激活声明，契约需求形成协议需求，权限请求和静态贡献分别形成权限与扩展声明。订阅、来源、制品和安装相关信息保留在 `PluginManifest` 中；当前 `ComponentManifest` 接收身份、激活、协议需求、权限与扩展信息。
