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

本包是 DSH profile bundle，由 `cordis.patch.yml` 激活。Adapter 读取当前 profile 的 dependencies，发现 Community v0.15 `dsh-plugin.json`，校验组件声明并读取 facet 入口。

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

## UI ContributionHost 版本

Host 集成调用 `registerUiContributionProvider(provider)` 时默认只声明 `ui.dsh/v1alpha1`，保持已有行为。显式启用时，第二个参数传入 `{ apiVersions: ['ui.dsh/v1alpha2'] }` 或 `{ apiVersions: ['ui.dsh/v1alpha1', 'ui.dsh/v1alpha2'] }`。空列表、未知版本与重复版本会被拒绝。Support 描述 provider 实际提供的 surfaces；V1 support 不满足 V2 requirement。撤销后重新注册相同 provider 对象或 participant 不得恢复旧 agreement；consumer 必须通过新的 activation 与新注册协商。

独立 browser runtime 为 SettingsSection 与 ToolCallView surfaces 实际声明两个精确 ContributionHost 版本。Facet 按其声明且实际获得 surface 授权的版本分别取得 client，每个 client 只含该版本的已协商授权。整体 optional requirement 没有可用 surface 时，agreement 与 warning 仍可查询，但不授予 client。V2 至少要求一个必需 surface；缺失的 `optionalSurfaces` 产生协商 warning，并从 client 中省略。缺失或未声明的 surface 不能注册。同一 activation、同一 surface 的 contribution ID 在两个版本间仍保持唯一；释放 lease 后可复用 ID。Facet 激活失败、卸载及 Host provider 撤销会关闭受影响的所有版本 client，并撤销注册。

Community v0.15 browser facet 使用已有的 namespaced `contributes['x-dev.dsh-std.extensions']` lane，不改变根级 `requires` 或 `panels`：

```json
{
  "id": "example.settings.browser",
  "apiVersion": "browser.ui.dsh/v1alpha1",
  "kind": "LocalModule",
  "name": "browser",
  "spec": {
    "module": "dist/client.js",
    "requirements": [{
      "apiVersion": "ui.dsh/v1alpha2",
      "kind": "ContributionHost",
      "spec": {
        "surfaces": [{ "apiVersion": "browser.ui.dsh/v1alpha1", "kind": "SettingsSection", "mode": "local-module" }],
        "optionalSurfaces": [{ "apiVersion": "browser.ui.dsh/v1alpha1", "kind": "ToolCallView", "mode": "local-module" }]
      }
    }]
  }
}
```

发现流程经 manifest 投影与 module transport 保留这些 browser 独立 requirements。Module 通过 `context.protocols.client({ apiVersion: 'ui.dsh/v1alpha2', kind: 'ContributionHost' })` 取得 client，并在注册可选 view 前检查 client 的 surfaces。LocalModule ABI 自身仍为 `browser.ui.dsh/v1alpha1`；这不引入 TUI module ABI，也不授予其他领域 API。

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
