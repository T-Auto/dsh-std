# @dsh-std/composition

std 内部的组件组合与激活计划工具。调用方提供组件声明、激活驱动、协议目录、当前支持与扩展，以及选择策略和协议组合规则；本包返回选中项、协议绑定、激活次序和组合问题。

宏观设计见[composition 组件设计](../../docs/proposals/composition.zh.md)。下面说明本包的具体实现和接口。

## 实现组成

| 文件 | 内容 |
| --- | --- |
| [`src/index.ts`](src/index.ts) | 输入与计划类型、规则目录、组件整理、facet 选择、协议与扩展检查、拓扑排序 |
| [`tests/composition.spec.ts`](tests/composition.spec.ts) | 组件归并、驱动选择、协议绑定、权限、扩展冲突和排序行为的测试 |

本包依赖 `@dsh-std/manifest` 和 `@dsh-std/core`。Manifest 提供组件结构校验与 facet 身份工具；core 提供协议目录、坐标匹配和版本范围检查。

## 接口与输入

`compose(input, rules?)` 同步返回 `CompositionPlan`。`input` 使用 `CompositionInput`，包含以下字段：

| 字段 | 内容 | 是否必需 |
| --- | --- | --- |
| `manifests` | 内部组件声明数组 | 是 |
| `drivers` | 激活驱动描述数组；每项包含 `id`、`apiVersion`、`kind` | 是 |
| `protocols` | core 的 `ProtocolCatalog` | 是 |
| `liveDeclarations` | 已有参与者的协议声明，提供支持候选 | 否 |
| `liveExtensions` | 已有扩展及其 facet 归属 | 否 |
| `select` | 本次指定的组件名称、facet 名称及可选的 `required` 标记 | 否 |
| `policy` | 驱动选择与权限判断回调 | 否 |

第二个参数是 `CompositionRuleCatalog`。省略时，本次调用使用空规则目录。

## 组件整理与 facet 选择

实现先调用 `defineComponentManifest()` 校验、复制并冻结各份声明，再将对象键排序后序列化。序列化结果相同的声明归并为一份；剩余声明按组件名称、版本字符串和序列化内容排序。

归并后出现同名组件时，记录 `component-id-conflict`。组件关系在整个输入组件集中检查：

| 关系 | 检查结果 |
| --- | --- |
| `depends` | 目标缺失或版本不匹配时记录错误 |
| `recommends` | 目标缺失或版本不匹配时记录警告 |
| `breaks` | 匹配版本的目标存在时记录错误 |
| `conflicts` | 匹配版本的目标存在时记录警告 |

每个组件的 facets 按名称遍历。省略 `select` 时，所有 facets 进入选择流程；提供 `select` 时，只有列表中的 facets 进入，其他项记为 `not-requested`。

具有激活声明的 facet 按精确的 `apiVersion + kind` 匹配驱动。一个匹配项直接选用；多个匹配项交给 `policy.selectActivationDriver(identity, activation, candidates)`，该回调返回选中的驱动 ID。

缺少匹配驱动或未能选定驱动时，facet 记为 `activation-unavailable`；其选择项带有 `required: true` 时，同时记录错误。没有激活声明的 facet 可作为声明项选中。

调用方提供权限判断回调时，对选中 facet 的每项权限请求调用 `policy.authorizePermission(identity, permission)`。返回 `false` 时，可选权限记录警告，必需权限记录错误；省略回调或返回其他结果时继续处理。

## 协议组合规则

`CompositionRuleCatalog` 内部使用一个 `Map`，按 `apiVersion + kind` 保存规则。

| 接口 | 功能 |
| --- | --- |
| `register(rule)` | 登记规则，返回撤销本次登记的函数；重复坐标抛出错误 |
| `resolve(reference)` | 按坐标返回规则，找不到时返回 `undefined` |

规则类型是 `ProtocolCompositionRule`，包含协议坐标与两个方法：

- `preflight(input)`：接收需求候选和支持候选，返回问题数组，或包含 `issues`、`bindings` 的对象。
- `composeExtensions(input)`：可选方法，接收同组扩展及其归属，返回问题数组。

规则中返回的问题包含 `code`、`severity`、`message` 和可选的 `path`；composition 补充相关组件信息。

## 协议候选与绑定

选中 facet 的 `requires` 形成 `ProtocolRequirementCandidate`；选中 facet 的 `supports` 和已有声明的 `supports` 形成 `ProtocolSupportCandidate`。候选标识由归属、协议坐标和声明中的索引生成。

实现用 `protocols.resolve()` 找到每项需求的协议定义，再收集解析到同一定义的支持候选。需求的定义未知，或没有候选支持时，必需需求记录错误，可选需求记录警告。

对每组需求，按其协议定义的坐标查找组合规则。有规则时调用 `preflight()`；基础检查负责定义与支持候选的存在性，规则负责进一步检查内容及建立绑定。

`ProtocolBinding` 包含一个 `requirementId` 和一组 `supportIds`。实现检查这些标识是否来自本次规则输入、需求是否重复绑定、同一绑定中的支持是否重复。有效绑定加入计划，错误引用记为 `protocol-binding-invalid`。

## 扩展检查与激活次序

已有扩展和选中 facet 的扩展汇入同一列表，按精确坐标分组。有 `composeExtensions()` 时，使用规则返回的问题；使用基础检查时，同组中的重复扩展名称记为 `extension-conflict`。

激活图以选中 facet 的身份字符串为节点，包含两类边：

- 组件的 `depends` 关系：被依赖组件的每个选中 facet 指向依赖组件的每个选中 facet。
- 协议绑定：待激活的支持提供方指向需求方。已有参与者的支持作为环境信息参与绑定。

实现使用入度与就绪队列进行拓扑排序，每次选取就绪队列中身份字符串最小的节点。图中存在环时，记录 `dependency-cycle`，`activationOrder` 保留已经排出的节点。

## 计划与结果

| 字段 | 内容 |
| --- | --- |
| `apiVersion` | `composition.dsh/v1alpha1` |
| `selected` | 选择阶段记录的 facet 身份、组件声明、facet、驱动和计划参与者 ID |
| `skipped` | 跳过的 facet 身份、类别与原因 |
| `bindings` | 规则返回并通过标识检查的绑定；当前实现始终返回该数组 |
| `activationOrder` | facet 身份字符串组成的激活次序 |
| `extensions` | 已有及选中 facet 的扩展与归属 |
| `issues` | 类别、级别、相关组件、说明及可选的字段路径 |
| `compatible` | `issues` 中没有 `error` 时为 `true` |
| `revision` | 组件声明、选中 facet 标识、已有协议声明和绑定的 FNV-1a 32 位摘要 |

计划参与者 ID 使用 `组件名@版本#facet名`。`revision` 将上述数据的对象键排序、数组顺序保留后序列化，结果使用 `fnv1a32:` 前缀。

组件结构错误、规则或策略回调抛出的异常直接传给调用方；组合检查发现的问题汇入 `issues`。选中记录保留选择阶段的结果，整份计划的检查结果由 `compatible` 汇总。计划对象与结果数组在返回时冻结。

## 对接下游

Adapter 调用 `compose()`，读取计划与问题列表，再将兼容计划交给 lifecycle。Lifecycle 根据 `selected` 和 `activationOrder` 找到驱动并激活 facet，在激活过程中调用 core 协商实际协议声明，并管理实例和注册项的生命周期。
