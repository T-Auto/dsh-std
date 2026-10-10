# @dsh-std/manifest

std 内部的组件声明与校验工具。上游提供组件信息和内容校验规则，本包将信息组织为统一的 `ComponentManifest`，检查结构与具体内容，供 composition 编排、lifecycle 激活和 Adapter 集成使用。

组件声明包含身份、各个 facet 的启动方式、协议需求与支持、扩展、权限请求，以及组件之间的关系。`ManifestDefinitionCatalog` 保存上游注册的激活和扩展校验规则；调用方还可以提供 core 的 `ProtocolCatalog`，检查声明引用的协议。内容校验结果通过 `ManifestValidationReport` 汇总。

本包也提供 [DSH 社区互操作草案 v0.15](https://github.com/deepseek-ai/deepseek-harness/discussions/2714) 定义的 `dsh-plugin.json` 格式的解析、规范化和内部模型转换，随包导出 `@dsh-std/manifest/schema/dsh-plugin-0.15.schema.json`。

组件模型、校验流程、接口与下游对接见[组件设计](../../docs/proposals/manifest.zh.md)。
