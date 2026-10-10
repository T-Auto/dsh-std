# @dsh-std/manifest

std 内部的组件声明与校验工具。调用方提供组件信息、激活与扩展的校验规则，以及可选的协议目录；本包整理声明、检查内容，返回统一的组件对象和校验报告，供 composition、lifecycle 与 Adapter 使用。

宏观设计见[manifest 组件设计](../../docs/proposals/manifest.zh.md)。下面说明本包的具体实现和接口。

## 实现组成

| 文件 | 内容 |
| --- | --- |
| [`src/index.ts`](src/index.ts) | 数据类型、包描述解析与转换、组件结构校验、规则目录及报告生成 |
| [`schema/dsh-plugin-0.15.schema.json`](schema/dsh-plugin-0.15.schema.json) | v0.15 包描述格式的 JSON Schema |
| [`tests/manifest.spec.ts`](tests/manifest.spec.ts) | 解析、规范化、模型转换和校验行为的测试 |

本包的运行时依赖是 `@dsh-std/core`。协议坐标、JSON 数据、语义版本和版本范围的检查使用 core 的工具；组件字段及包描述字段的检查由本包的校验函数完成。JSON Schema 作为独立文件随包导出，供外部工具使用。

## 数据模型

实现中有两种描述对象：

- `PluginManifestInput` 与 `PluginManifest`：前者表示待校验的 v0.15 包描述，后者表示补齐空容器后的结果。
- `ComponentManifest`：供 std 内部模块使用的组件声明，坐标为 `manifest.dsh/internal/v1alpha1 Component`。

内部组件用 `metadata` 保存名称、版本和显示名称，用 `spec.facets` 保存各部分的声明。每个 facet 有自己的名称，可以描述启动方式 `activation`、协议需求与支持 `protocols`、功能扩展 `extensions`、权限请求 `permissions`。组件关系保存在 `spec.relationships` 中。

上游可以直接构造内部组件对象，也可以先解析包描述，再转换为内部模型。

## 内部组件如何校验

### 结构校验

| 接口 | 使用方式与结果 |
| --- | --- |
| `validateComponentManifest(value)` | 检查未知输入是否符合组件结构；通过时正常返回 |
| `defineComponentManifest(manifest)` | 检查组件结构，复制并递归冻结对象后返回 |

结构校验检查组件坐标、字段、名称、语义版本、facet 名称的唯一性、声明参数的 JSON 结构，以及组件关系中的名称与版本范围。

重复项按各自的范围检查：协议需求与支持分别按坐标检查；扩展按坐标与名称检查；权限请求按坐标与操作名检查。结构错误抛出 `TypeError`，消息包含字段位置与原因。

### 注册内容校验规则

调用方创建 `ManifestDefinitionCatalog`，将激活和扩展各自的规则注册进去。目录内部使用两个 `Map`，分别保存两类规则，以 `apiVersion + kind` 为键。

规则采用 `ManifestObjectDefinition`，包含协议坐标、必需的 `validateSpec()`，以及可选的 `validateMetadata()`。激活规则检查启动参数；扩展规则检查配置，并可检查名称与标签。

| 目录接口 | 功能 |
| --- | --- |
| `registerActivation(definition)` | 登记激活规则，返回撤销本次登记的函数 |
| `registerExtension(definition)` | 登记扩展规则，返回撤销本次登记的函数 |
| `activation(reference)` | 按坐标查找激活规则 |
| `extension(reference)` | 按坐标查找扩展规则 |
| `validate(manifest, protocols?, options?)` | 校验组件并返回 `ManifestValidationReport` |

同一类规则中的重复坐标在注册时抛出错误。查找不到规则时，查找接口返回 `undefined`。

### 执行内容校验并生成报告

`validate()` 先调用 `defineComponentManifest()` 检查共同结构，再遍历每个 facet：

1. 查找激活规则，调用 `validateSpec()`。
2. 调用方提供 core 的 `ProtocolCatalog` 时，用 `understands()` 检查协议需求与支持的坐标。
3. 查找扩展规则，依次调用 `validateMetadata()`（如有）和 `validateSpec()`。

规则正常返回表示检查通过，抛出的错误汇入报告。校验使用规则的检查结果，组件声明保留原有内容。

报告的 `apiVersion` 为 `manifest.dsh/report/v1alpha1`，包含组件身份、校验器身份、来源 `source`、摘要 `digest`、问题列表 `issues` 和结果 `compatible`。每个问题包含类别、级别、字段路径和说明。

找不到规则或协议坐标时记录 `warning`；已注册规则检查失败时记录 `error`。`compatible` 在报告中没有 `error` 时为 `true`。

`options` 可以传入来源和摘要。默认来源是 `memory:`；默认摘要将对象键排序、数组顺序保留后序列化，再计算 FNV-1a 32 位值，使用 `fnv1a32:` 前缀。校验器身份可以在创建目录时传入，默认使用本包名称和版本。

## 包描述如何解析与转换

本包支持 [DSH 社区互操作草案 v0.15](https://github.com/deepseek-ai/deepseek-harness/discussions/2714) 定义的 `dsh-plugin.json` 格式。格式版本由 `manifestVersion: "0.15"` 标识。

| 接口 | 使用方式与结果 |
| --- | --- |
| `parseManifest(source, options?)` | 接收 JSON 文本，经 `JSON.parse()` 和 `defineManifest()` 返回规范化对象；`options.source` 用于错误消息中的来源标识 |
| `validateManifest(value)` | 检查包描述对象的版本与字段结构 |
| `defineManifest(manifest)` | 校验对象，复制、补齐空容器并递归冻结后返回 |
| `projectManifest(manifest)` | 校验并规范化包描述，转换为内部组件对象后返回 |

规范化补齐 `requires.contracts`、`permissions`、`contributes.commands` 和 `subscriptions` 的空容器。JSON 语法错误由 `parseManifest()` 抛出 `SyntaxError`，字段及版本错误抛出 `TypeError`。

v0.15 的转换产生一个名为 `host` 的 facet，主要字段对应如下：

| 包描述中的信息 | 内部组件中的位置 |
| --- | --- |
| `id`、`name`、`version` | `metadata.name`、`metadata.displayName`、`metadata.version` |
| `facets.host.entry` | `lifecycle.dsh/v1alpha1 FacetModule` 激活声明的 `spec.module` |
| `requires.contracts` | `protocols.requires`；可选标记保留，降级说明存入 `x-community-fallback` |
| `permissions` | `community.dsh/v1alpha1 Permission` 请求，保存操作名、范围和理由 |
| `contributes.commands` | `commands.dsh/v1alpha1 Command` 扩展，保存标题与说明 |
| `contributes` 的 `x-*` 数组 | 具有 `apiVersion`、`kind`、`id`、`name`、`spec` 的对象转换为相应扩展 |

命令的局部名称取完整 ID 的最后一段；完整 ID 保存在 `dsh.std/contribution-id` 标签中。订阅、来源、制品和安装相关信息保存在规范化的 `PluginManifest` 中。内部转换提取上表中的组件与 facet 信息。

Schema 的包导出路径是 `@dsh-std/manifest/schema/dsh-plugin-0.15.schema.json`。

## 对接下游

调用方将 `ComponentManifest` 交给 composition 生成计划，lifecycle 按计划执行激活。Adapter 将声明、校验报告与产品接入流程串联起来。

本包提供四个辅助接口供这些模块定位声明：

| 接口 | 结果 |
| --- | --- |
| `findFacet(manifest, name)` | 按名称返回 facet；没有匹配项时返回 `undefined` |
| `facetIdentity(manifest, facet)` | 返回组件名称、版本与 facet 名称组成的身份对象 |
| `facetKey(identity)` | 将身份转换为 `组件名@版本#facet名` 字符串 |
| `matchesExtensionPublicationName(extension, name)` | 检查名称是否匹配扩展的局部名称或完整贡献 ID |
