# @dsh-std/adapter-dsh

[English](README.md) | 中文

DeepSeek Harness 的产品适配层，将标准组件接入 DSH 的命令、工具、模型、会话和浏览器 UI。

本包提供本项目兼容的adapter产品,供集成方使用.

## 安装

将 Adapter 和标准组件安装到同一 profile：

```sh
dsh plugin --profile web add @dsh-std/adapter-dsh
dsh plugin --profile web add <standard-component>
```

## 运行方式

本包是 DSH profile bundle，由 `cordis.patch.yml` 激活。Adapter 读取当前 profile 的 dependencies，发现 Community v0.15 `dsh-plugin.json`，检查 Host API，并在导入每个 host facet 入口前校验与预检静态声明。未知的必需 contract 或缺少 live 支持的必需 contract 会在模块求值前拒绝该 facet；缺少可选 contract 不阻止加载。仅已安装的 provider 不算 live 能力。

导入后，`mount()` 在激活前依据当前 live 发布再次检查。预检只覆盖 manifest 可读的需求，不预判只有执行动态代码才能发现的需求，也不代替运行时协商或回滚。

`DshStandardAdapter` 组织协议协商与激活，向组件提供所需 API，并将组件发布的能力接入产品服务。宿主侧需要 `sessionController` 服务。

需要先提供宿主内建能力时，可设置 `discover: false` 启动 Adapter，再加载 `@dsh-std/adapter-dsh/profile-loader` 执行组件发现与激活。集成方也可以直接调用 `mount()`，提交声明、facet 名称和激活函数。

## 提供的能力

| 能力 | 接入方式 |
| --- | --- |
| 命令 | 提供命令目录和 `CommandRuntime`；产品 UI 注册对应 placement 的 provider 后，命令进入该 UI 的原生命令入口 |
| 模型 | 将模型处理函数接入 DSH LLM registry，并提供 `ModelCatalog` |
| 工具 | 将 `Tool` 和 `ToolOverride` 接入 Agent 的工具运行环境 |
| Skill | 接入原生 Skill provider registry，按请求读取包内 Markdown |
| 会话 | 提供 `SessionCatalog` 的 list/get/create/rename，以及 `SessionHistory` 的 read/follow |
| 浏览器 UI | 加载标准浏览器模块，提供 `SettingsSection` 和 `ToolCallView` surfaces |

工具在 DSH 本地执行，使用产品提供的模型、附件、文件访问、写入意图、sandbox 和嵌套上下文。

浏览器部分读取 `LocalModule` 声明，提供包内模块产物并接入原生 UI slot。UI 注册随所属 facet 停用而撤销。DSH 的“插件”页显示标准组件及其运行状态。

## 发布与清理

组件在激活期间通过 `context.protocols.implement()` 登记协议实现，通过 `context.extensions.publish()` 登记扩展处理函数。激活、校验和协商成功后，这些能力进入可调用状态。

注册项关联到本次激活实例。激活失败、卸载或停止时，Adapter 按实例撤销能力、产品注册和连接声明。

## 会话创建请求

`SessionCatalog.create` 按 request ID 保存初始输入和完成结果。实例内重复请求返回原结果并保留后续改名；同一 ID 改变输入会返回错误。调用方应使用全局唯一的 request ID。

请求记录保存在 Adapter 实例内。Adapter 重建后，重复请求若对应已有会话，则返回该会话的当前状态，并保留已有标题。

## 文档

- [Adapter 设计](../../docs/proposals/adapter-dsh.zh.md)：Adapter 的作用及其在 std 中的位置。
- [本项目 Adapter 的实现](../../docs/proposals/adapter-dsh-reference.zh.md)：加载、激活、产品接入与卸载。
- [Adapter 接入 std 所需接口](../../docs/proposals/adapter-std-interfaces.zh.md)：自行实现 Adapter 时需要对接的接口。
