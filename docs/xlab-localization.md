# 首页语言与字体对齐

2026-09-10。以 iOS 工作区当前 XLab 首页为参考（HEAD `74f678e`，包含工作区状态），同步首页语言选择、文案与最新字号。当前国际化范围为首页卡片、API Key 帮助/显隐、首页错误及配置加载/保存提示；实时生成页和存储功能页尚未国际化。

## 语言和持久化

- 顶部版本右侧为 44 × 44 地球按钮，选项顺序与 iOS 一致：跟随系统、简体中文、English；当前项显示勾选。RN 使用本地浮层呈现，无新增原生依赖。
- 默认跟随系统，通过运行时 Intl 获取设备 locale；中文 locale 使用简体中文，其他语言回退英语。前台恢复时刷新系统 locale，显式选择覆盖系统设置。
- 语言通过现有配置队列单独保存到 `ai.xmax.xlab.configuration.v1.language`。缺失或不识别的旧值回退跟随系统，不覆盖原有国内/海外 Key。
- 切换语言只更新文案上下文，不重建首页、导航或 API Key 输入框，不改变 API 环境。菜单打开时收起键盘。保留原 ScrollView 实例和滚动位置，内容高度变化时遵循原生滚动范围。
- 保存错误保持稳定的消息键，显示时翻译；失败可重试，排队的新语言不会被旧写入覆盖。正常保存仍静默进行。
- `src/localization/messages.ts` 保存独立中英文文案，沿用 iOS 的 `feed.*` 键和原文；模型数量占位符适配为 `{count}`。RN 专有状态单独补充。构建与运行不读取 iOS 仓库。
- 平台名、最低系统、SDK 版本与支持的模型仍取 RN 实际值；未接入的自定义渲染保留禁用状态和双语提示。
- API Key 申请入口按当前 API 环境跳转：国内为 `https://platform.xmaxai.com/api-keys`，海外为 `https://platform.xmax.ai/api-keys`；不按界面语言判断。打开失败时的中英文提示显示同一目标地址。

## 字体

集中使用 `theme/tokens.ts` 的 `feedFont`，保持 iOS `visualScale = 1.15`。下表为乘倍率前的基准字号：

| 内容 | 原 RN | 当前 iOS / RN |
| --- | --- | --- |
| 首页主标题 / 副标题 | 24 / 12 | 22 / 11 |
| 输入管线标题 / 说明 | 21 / 12 | 19 / 11 |
| 功能卡片标题 / 说明 | 18 / 10 | 17 / 9.5 |
| 分区标题 | 10 | 13 |

其余字号、字重、1.15 倍率及原有配色保持对应关系；长英文标题和说明允许自然换行。顶部安全区与 Realtime 底部安全区 padding 沿用当前页面约定。

## 参考指纹和验证

参考路径相对 `/Users/xmax.ai/dev/Xmax/iOS/XmaxSDK`：

- `Examples/XLab/XLab/Modules/XLFeed/FeedViewController.swift`：`5f5fc982e9822414fbabaeaa0184fbd6c96756d1e7b1b22c80e931ec65d6f5b3`
- `Examples/XLab/XLab/Modules/XLFeed/FeedComponents.swift`：`35b128ab9436170b3d31e80d797c54bb8169fc61a70bf89264f29fa0f982ba6f`
- `Examples/XLab/XLab/Resources/Localizable.xcstrings`：`8fd3e2ad962658050941bae3e12ba6b198a5846451b5ff496d105269901a09ff`

SDK / XLab typecheck、ESLint、Prettier、SDK 构建与 60 项测试通过，iOS / Android Release JS bundle 及资源打包通过。逻辑检查覆盖语言恢复、快速选择、失败重试、旧配置兼容、Key/环境隔离、系统语言解析、文案键/占位符完整性和已有错误切换语言。未重新构建原生整包、操作设备、输入真实 Key 或补录截图；需要用户检查窄屏中英文布局、菜单、系统语言、重启恢复和导航返回。原有 UI 截图不代表本轮语言与字号已完成真机验收。
