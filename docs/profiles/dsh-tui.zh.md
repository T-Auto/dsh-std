# TUI 准入 Profile

[English](dsh-tui.md) | 中文

- 页面类型：Profile 链接页（信息性；不复制 Profile 正文）
- Profile id：`dsh-tui`
- 产品形态：终端 shell（TUI）

| | |
| --- | --- |
| 归属方 / 载体 | [ccch1mneyyy/dsh-TUI](https://github.com/ccch1mneyyy/dsh-TUI) |
| Profile 正文位置 | 该仓库内的 [`tui-profile/`](https://github.com/ccch1mneyyy/dsh-TUI/tree/main/tui-profile)，与产品代码放在一起，随代码一起修订 |
| 生态范围 | 终端形态的产品，以及面向它们的子插件 |

## 权威正文

只看链接即可：所有准入细节以归属方仓库为准。

- [Profile 准入与开发指南](https://github.com/ccch1mneyyy/dsh-TUI/blob/main/tui-profile/docs/plugin-admission-and-development.md)——Profile 定位、准入要求（使用该 Profile 自己的稳定编号前缀 `TUI-*`）、插件契约、接缝目录与验证清单
- [Profile 根目录](https://github.com/ccch1mneyyy/dsh-TUI/tree/main/tui-profile)——README、治理、设计说明与准入检查表
- [Profile registry](https://github.com/ccch1mneyyy/dsh-TUI/tree/main/tui-profile/registry) 与 [conformance](https://github.com/ccch1mneyyy/dsh-TUI/tree/main/tui-profile/conformance)——机器可读的 Profile 数据与 fixtures
- [生态插件与插件模板](https://github.com/dsh-tui-ecosystem)
- 生态索引侧：[dsh-ecosystem-spec `profiles/`](https://github.com/T-Auto/dsh-ecosystem-spec/tree/main/profiles)

## 本页刻意不写的内容

准入版本、要求编号、接缝清单、权限名、信任披露与验证入口都在归属方正文里，并随它变化。
在这里复述一遍，等于多出一份会在终端产品改 Profile 的那一刻就过期的副本——所以本页只做
指向。

## 面向以该 Profile 为目标的插件

- 从归属方的准入与开发指南开始（上面第一个链接）。
- 终端形态是[跨 Profile 应用指南](README.zh.md)描述的形态之一；那份指南里的做法，正是让
  同一个包在这里、在浏览器形态、以及在无界面组合里都能工作的东西。
