# Adapter 接入 std 所需接口

本文按职责列出接入 std 的接口及其作用。实现者根据自己的 Adapter 提供或使用的能力选择对应条目，并参照领域协议补齐具体操作和数据结构。

概念说明见 [Adapter 设计](adapter-dsh.zh.md)，本项目示例见 [本项目 Adapter 的实现](adapter-dsh-reference.zh.md)。

## 1. 协议声明

参与标准协议交互时，提交 `ProtocolDeclaration`：

- **`participant`**：提供当前协商范围内唯一的参与者身份。
- **`requires`**：列出需要调用的协议及其参数；可选需求使用 `optional` 标记。
- **`supports`**：列出当前实际提供的协议及其功能范围。
- **`apiVersion + kind`**：标识每项协议；参数和具体接口由该坐标对应的领域协议规定。

以标准组件接入时，manifest 提供组件身份、facet、激活入口和静态需求。Facet 是独立声明与激活的部分；运行时发布关联到它的激活实例。

字段与语义见 [core](core.zh.md) 和 [manifest](manifest.zh.md)。

## 2. 激活入口与驱动

负责插件运行的 Adapter 对接激活与停止。两侧接口分别如下：

- **模块入口 `activate(context)`**：接收 `ActivationContext`，执行本次实例的初始化；返回 `void` 或 `Promise<void>`。
- **模块停止 `deactivate(reason)`**：可选，接收停止原因，结束自行管理的工作；返回 `void` 或 `Promise<void>`。
- **宿主驱动 `activate(request)`**：接收选中的 facet、激活声明和上下文，调用自己的插件入口；返回 `void` 或 `Promise<void>`。
- **宿主驱动 `deactivate(identity, reason)`**：可选，按给定实例停止入口；返回 `void` 或 `Promise<void>`。
- **驱动的 `id` 与协议坐标**：标识驱动及其支持的激活类型。

上下文提供以下对象：

- **`identity`**：component、version、facet、generation、instanceId 和 participantId，定位当前激活实例。
- **`plan`**：本次激活的组件计划。
- **`protocols`**：取得协议 API 和登记实现的接口。
- **`extensions`**：发布扩展处理函数的接口。
- **`scope`**：清理函数登记入口及取消信号。

重新激活使用新的实例身份。激活失败或停止时，撤销本次实例的注册项。完整接口和状态规则见 [lifecycle](lifecycle.zh.md)。

## 3. 协议 API 访问

### 使用能力的接口

- **`context.protocols.agreement(reference)`**：输入协议坐标，返回该实例的协商结果；缺少结果时返回 `undefined`。
- **`context.protocols.client<T>(reference)`**：输入协议坐标，返回对应调用接口；不可用或实例范围已关闭时返回 `undefined`。

Client 的方法、输入和返回值由所采用的领域协议定义。

### 宿主提供 API 的接口

`ActivationProtocolAccessBackend` 为激活上下文提供协议访问：

- **`open(request)`**：输入实例身份、协议声明和协商结果；返回本次访问的 session，或 `undefined`，支持异步返回。
- **`session.client<T>(reference)`**：输入协议坐标，返回对应 client 或 `undefined`。
- **`session.close(reason?)`**：释放本次访问范围；返回 `void` 或 `Promise<void>`。

生命周期协调器将 session 的关闭关联到实例清理。受保护 API 按宿主授予的权限提供，相关语义见 [permission](permission.zh.md)。

## 4. 能力发布

通过激活上下文提供能力时，对接以下接口：

- **`context.protocols.implement(support, implementation)`**：输入协议支持声明与实现对象，登记本次实例提供的协议实现；返回撤销函数。
- **`context.extensions.publish(reference, name, handler)`**：输入扩展协议坐标、该 facet 静态声明中的扩展名称和处理函数，绑定扩展实现；返回撤销函数。

实现先暂存，激活与校验成功后公开。公开声明必须与实际可调用的实现一致；停止、重载或激活失败时按实例撤销。

具体实现对象与 handler 的形状，由相应领域协议规定。

## 5. 资源清理

- **`context.scope.add(dispose)`**：输入同步或异步清理函数，将资源释放关联到实例；返回 `() => Promise<void>`，供提前清理。
- **`context.scope.signal`**：只读 `AbortSignal`，在实例范围关闭时发出取消信号。
- **停止回调**：结束 Adapter 或插件自行创建的工作，配合登记的清理函数释放资源。

清理函数主体至多执行一次。旧实例只撤销自己的注册项；新实例使用新的上下文。清理失败时保留错误，并继续释放其余已登记资源。

## 6. 失败说明

接入失败时说明涉及的协议或入口、失败阶段和原因，如必需协议缺失、版本不兼容、领域接口不满足或清理失败。保留已完成的清理情况与剩余问题。

TypeScript 辅助函数见 [SDK](sdk.zh.md)，接口类型见 [lifecycle 源码](../../packages/lifecycle/src/index.ts)。
