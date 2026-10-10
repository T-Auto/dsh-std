# @dsh-std/core

[English](README.md) | 中文

协议声明、definition 注册与协商的最小元协议。设计见 [Core Meta-protocol](../../docs/proposals/core.zh.md)。

Core 只认识 `apiVersion`、`kind`、participant、requirement、support、协议 definition 及其 agreement。它不预设 resource、capability、provider、execution plane、locality、endpoint 或插件生命周期。

`ProtocolCatalog` 由评估器持有。每个协议 definition 明确列出接受的 API 版本，分别校验 requirement/support 的 `spec`，并拥有自己的协商逻辑。Core 不会从相同主版本推断兼容性，也不会把安装了一份 definition 当作已有 live implementation。

`defineProtocolDeclaration()` 校验并冻结一个 participant 当前实际发布的 requirements 与 supports。静态组件上限属于 `@dsh-std/manifest`，选择属于 `@dsh-std/composition`，激活与 publication barrier 属于 `@dsh-std/lifecycle`，跨端点 offer 属于 `@dsh-std/connection`。

协议专属的 provider 选择、多项合并、目录、调用绑定和 UI 语义均由相应 definition 或独立协议包定义。

阅读 [core 设计与接口说明](../../docs/core-guide.zh.md)，了解完整使用流程、接口和内部下游。

## API 入口

| 导入路径 | 用途 |
| --- | --- |
| `@dsh-std/core` | 协议声明、definition、catalog 注册与协商报告 |
| `@dsh-std/core/identity` | 协议坐标的校验、比较与索引键 |
| `@dsh-std/core/json` | 协议 JSON 数据校验与冻结快照 |
| `@dsh-std/core/version` | 组件包的 SemVer 解析、比较与版本范围 |

主入口提供 `defineProtocolDeclaration()`、`validateProtocolDeclaration()` 和 `ProtocolCatalog`。Catalog 提供 `register()`、`resolve()`、`understands()` 和 `negotiate()`；`register()` 返回该 definition 的注销函数。

参与者身份使用 `{ id }`，评估器身份使用 `{ name, version }`。Definition 校验函数通过 `ApiReference` 接收声明中的协议坐标；协商输入的每行将 participant 与对应的 requirement 或 support 放在一起。
