# 本项目 Adapter 的实现

`@dsh-std/adapter-dsh` 将标准组件接入 DeepSeek Harness。它本身作为 DSH 插件加载，使用 Cordis 管理运行关系，通过 `DshStandardAdapter` 组织标准组件的激活与能力接入。

整体作用见 [Adapter 设计](adapter-dsh.zh.md)，通用接口见 [Adapter 接入 std 所需接口](adapter-std-interfaces.zh.md)。

## 从安装到激活

Adapter 包是一个 DSH profile bundle。安装后，DSH 执行它的 `cordis.patch.yml`，加载 Adapter 并传入当前 profile 的位置。

```sh
dsh plugin --profile web add @dsh-std/adapter-dsh
dsh plugin --profile web add <standard-component>
```

Adapter 读取 profile 的普通 dependencies，找到各包中的 `dsh-plugin.json`，校验并转换为标准组件声明。对于采用 `lifecycle.dsh/v1alpha1`、`FacetModule` 激活类型的 facet，它解析包内入口模块，取得模块导出的激活函数，再交给 `mount()`。

`mount()` 检查该 facet 的声明与需求，建立激活计划，然后调用生命周期协调器。协调器创建本次实例和激活上下文；激活驱动调用模块的 `activate(context)`。

```mermaid
flowchart TB
    subgraph Core["DSH 原生装载机制"]
        Loader["Loader 与 Cordis"]
    end
    subgraph Plugin["Adapter 插件"]
        Discover["发现 manifest 并读取入口模块"]
        Mount["mount：检查声明与建立计划"]
        Lifecycle["生命周期协调器与激活驱动"]
        Map["能力发布与产品接入"]
    end
    Component["标准组件入口 activate"]
    Services["DSH 产品服务"]
    Loader -->|加载 bundle| Discover
    Discover --> Mount
    Mount --> Lifecycle
    Lifecycle -->|提供激活上下文| Component
    Component -->|提交实现与注册项| Map
    Map --> Services
```

## 基础管理对象

`DshStandardAdapter` 使用以下对象组织接入：

| 对象 | 在本实现中的用途 |
| --- | --- |
| 协议规则库与声明规则库 | 解释组件声明，检查所需协议和扩展的格式 |
| 组合规则与激活驱动 | 建立 facet 的激活安排，并调用其入口 |
| 生命周期协调器 | 管理实例、暂存实现、发布和停止 |
| 已发布能力表 | 保存实例当前提供的协议实现与扩展 |
| 连接端点 | 向组件提供协商后的 API，并接入已发布实现 |
| 组件与 facet 记录 | 保存已挂载对象及其产品接入、停止操作 |

## 怎样接入产品能力

该实现将插件发布的能力接入 DSH，同时提供 DSH 服务对应的标准调用接口。

| 能力 | 接入方式 |
| --- | --- |
| 命令 | 建立标准命令目录和 `CommandRuntime`；产品 UI 提供对应位置的 provider 后，接入其原生命令入口 |
| 模型 | 将组件提供的模型处理函数接入 LLM registry，并提供 `ModelCatalog` |
| 工具 | 将工具及工具替换接入 Agent 的工具运行环境 |
| Skill | 将组件资源接入原生 Skill provider registry，按具体请求读取包内 Markdown |
| 会话 | 使用 `sessionController` 提供 `SessionCatalog` 的 list/get/create/rename，以及 `SessionHistory` 的 read/follow |
| 浏览器 UI | 通过 client module transport 加载标准浏览器模块，接入 settings section、tool call view 等 surface |

以命令组件为例：manifest 声明命令，入口在激活上下文中发布处理函数；激活成功后，命令进入标准目录并可通过 `CommandRuntime` 调用。产品 UI 注册相应位置的 provider 后，该命令还可以进入该 UI 的命令入口。卸载时，命令和产品接入按本次实例撤销。

组件取得协议 API 时，Adapter 为本次实例创建连接端点，并与自身端点建立内存连接。协商后的 client 进入激活上下文，连接释放操作关联到实例清理范围。

## UI 精确版本与 browser 安装契约

`registerUiContributionProvider(provider, options)` 的 `options.apiVersions` 未提供时必须只发布 `ui.dsh/v1alpha1 ContributionHost`。显式列表必须非空，只包含 `ui.dsh/v1alpha1` 与 `ui.dsh/v1alpha2`，且不得重复。Adapter 必须按每个发布的精确坐标声明相同的实际 surface support，不得用 V1 support 满足 V2 requirement。

每次 activation 必须按 consumer 声明的精确 ContributionHost 版本分别绑定 client。V2 client 只包含成功协商的 required 与 optional surfaces；缺失 optional surface 的 warning 不得阻止具备全部 required surfaces 的 facet 激活，缺失项不得进入注册授权。V1 client 不得复用 V2 的额外授权。Browser 对整体 optional 且没有 surface 授权的已协商协议必须保留可查询的 agreement 与 warning，但不得授予 client。多个版本共享同一 activation owner 时，同一 surface 与 contribution ID 不得重复注册；lease disposer 完成后可复用 ID。撤销 Host provider、激活失败与 facet 卸载必须释放受影响的全部版本绑定，即使某项 disposer 失败也必须继续清理其他绑定。

独立 browser runtime 必须为实际实现的 SettingsSection 与 ToolCallView surfaces 发布两个精确 ContributionHost 版本，并独立完成 composition、agreement 与 activation client 绑定，不依赖 Host provider 注册 API。它必须复用 browser activation context 与 facet cleanup 边界，且不得混合不同版本的授权。

Community v0.15 包内 browser facet 必须经既有 namespaced `contributes['x-dev.dsh-std.extensions']` lane 声明 `browser.ui.dsh/v1alpha1 LocalModule`，`spec` 为 `{ module, requirements }`。包发现、manifest 投影与 browser module descriptor 传递必须保留 requirements 的精确版本及 V2 `optionalSurfaces`；这些 requirements 不得合并进 Host facet。安装声明示例见 [adapter README](../../packages/adapter-dsh/README.zh.md#ui-contributionhost-版本)。本契约不改变旧 Manifest 根级 `requires`/`panels`，不定义 TUI LocalModule 或公共 terminal surface 包。

## 卸载与清理

`mount()` 返回异步卸载函数。卸载时，Adapter 移除产品注册和连接声明，再交给生命周期协调器停止实例、调用停止回调并释放登记的资源。

Adapter 自身由 Cordis 销毁时，也会逐项停止它管理的 facet，并清理产品 provider 与浏览器模块记录。

## 其他接入入口

集成方可以直接调用 `mount()`，提交组件声明、facet 名称和激活函数。

需要先提供宿主内建能力时，可以设置 `discover: false` 启动基础 Adapter，再加载 `@dsh-std/adapter-dsh/profile-loader` 执行标准组件的发现与激活。

本包通过 `peerDependencies` 声明 DSH 产品依赖范围。代码与配置见 [Adapter 包](../../packages/adapter-dsh)。
