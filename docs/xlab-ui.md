# Example/XLab UI 对齐要求

2026-09-09。用户要求 RN 示例界面与现有 XLab 对齐。首版以 **iOS XLab 的 UIKit 实现**为视觉及交互基准，Android 使用同一套 RN 页面，仅在系统选择器、权限、安全区和返回行为上遵循平台规则。

## 1. 参考与优先级

参考根目录：`/Users/xmax.ai/dev/Xmax/iOS/XmaxSDK`。

| 内容 | 参考文件 |
| --- | --- |
| 首页布局 | `Examples/XLab/XLab/Modules/XLFeed/FeedViewController.swift` |
| 颜色、字体、卡片 | `Examples/XLab/XLab/Modules/XLFeed/FeedComponents.swift` |
| 生成页布局与状态 | `Examples/XLab/XLab/Modules/XLRealtime/UIKit/RealtimeViewController.swift` |
| 底部控制面板 | `Examples/XLab/XLab/Modules/XLRealtime/UIKit/View/RealtimeControlPanelView.swift` 及同目录子视图 |
| 分类和提示词 | `Examples/XLab/XLab/Modules/XLRealtime/RealtimeCategory.swift` |
| 参考图数据 | `Examples/XLab/XLab/Resources/Assets.xcassets/RealtimeReferenceCatalog.dataset/RealtimeReferenceCatalog.json` |
| 存储页 | `Examples/XLab/XLab/Modules/XLStorage/StorageViewController.swift` |
| 视觉截图 | `docs/images/xlab/home.jpg`、`features.jpg`、`realtime-generation.jpg`、`trajectory-generation.jpg`、`storage.jpg` |

本次已查看首页、实时生成和存储截图，并核对相关布局代码。截图中的 SDK 版本为较旧快照；截图与当前实现不一致时，以当前 UIKit 源码和本次首版范围为准。不能把截图中的版本号、MIN OS 或平台文案原样复制。

## 2. 页面和交互

| 页面 | 必须对齐的内容 |
| --- | --- |
| 首页 Feed | 品牌标识、顶部版本胶囊、深色渐变与背景光晕、介绍卡片、运行环境/最低系统/模型指标、API Key 输入与显隐、X2.0 模型卡片、输入管线卡片、存储能力卡片 |
| 相机生成页 | 全屏原生视频层、左上返回、右上翻转相机、底部分类与参考图面板、加载遮罩、停止生成、错误反馈及退出释放 |
| 图片生成页 | 选择图片后预览、沿用生成控制面板、触控动图入口和轨迹效果；没有相机翻转按钮 |
| 参考图与自由模式 | 横向分类/图片列表、选中描边、添加参考图、上传中/失败重试、自由提示词输入与键盘避让、提交后更新生成 |
| 存储页 | 橙色主题、返回与版本标识、说明卡片、文件选择/预览、type/resolution/size 元数据、上传按钮、安全检测、进度、耗时、URL 结果与复制、重新上传 |

分类顺序和默认提示词直接对齐 `RealtimeCategory.all`：换形象、换装、换风格、虚拟召唤、触控动图、自由。首版仍支持图片驱动的触控动图和内置轨迹交互。

生成页默认交互遵循原生实现：参考图选择/提示词提交驱动开始或更新生成，不另造一套表单式流程。生成连接状态、首帧显示、参考图上传是不同状态，UI 不得在连接完成时过早清掉等待画面的遮罩。

返回、Android 系统返回和导航手势退出都应释放当前页面 Manager。键盘弹出时仅调整控制面板，不重建相机/RTC。系统权限弹窗和照片选择器造成的临时 inactive 状态不得误触发“进入后台关闭”；后台策略以实际后台状态判断。

## 3. 首版功能差异表

| 原生 XLab 内容 | RN 首版处理 |
| --- | --- |
| 相机实时流 | 保留并对齐 |
| 图片生成管线 | 保留并对齐 |
| 本地视频生成管线 | 隐藏整个入口，不显示假按钮，不导出 createLocalVideoStream；生成页面的媒体选择器只选择图片 |
| 插帧按钮/状态 | 移除，重新排布右侧按钮；RN 包不引入插帧实现 |
| SwiftUI / Compose 专属演示 | 不复制平台专属入口，RN 生成页即组件接入示例 |
| 自定义轨迹 Renderer 示例 | 沿用既定 API 范围，首版不展示；内置轨迹仍然保留 |
| 原生录制按钮 | 沿用既定首版不提供录制接口的范围，不展示无功能录制控件 |
| 存储中的视频上传下载 | 保留，这是文件存储能力，不属于本地视频生成管线 |

首页移除不支持的卡片后自然收拢间距，剩余输入卡片连续编号。保留原生卡片样式与层级，不保留无内容空位。下载能力可在存储结果区域补充同风格操作，不重构原有上传页面。

## 4. 视觉常量与资源

将原生颜色映射为 `Example/XLab/src/theme/tokens.ts` 的集中配置：

| Token | 值 |
| --- | --- |
| 首页背景渐变 | `#0C121B` → `#070A0F` → `#090D13` |
| 主文字 | `#F4F7FB` |
| 次文字 | `#8E9AA9` |
| 相机/主强调 | `#8EF0C8` |
| 图片强调 | `#C9A3FF` |
| 存储强调 | `#F5B86C` |
| 其他原生强调色 | 蓝 `#78A9FF`、红 `#FF6B6B`、粉 `#FF8FD8` |

字体大小、字重、字距、行高和圆角从相应原生组件逐项映射，不统一套用某个组件库默认主题。首页原生字体 helper 有 `visualScale = 1.15`，需要按最终字号换算，不能仅复制调用参数。

生成面板的原生布局起点：分类行高 36、分类间距 14、参考图区域高 50、说明/提示词区域高 40、底部间距 10；以 RN 布局单位对齐并叠加系统安全区，不照搬截图像素值。小尺寸手机需要横向滚动与文本布局验证。

优先复用原生项目已有品牌、图片、参考图 JSON 和图标资源，复制到 Example 自身 assets 并保留来源记录；不依赖构建时读取开发机的 iOS 目录。系统专属图标使用匹配的跨平台资源，保持尺寸和线宽。RN 首页平台信息改为真实的 React Native/iOS 或 React Native/Android，普通 RN 主示例最低系统显示 15.1+ 或 8.0+；Expo 验收宿主的 iOS 下限为 16.4，不混用最低系统文案。

## 5. 验收方式

- 使用相同参考图片、分类、提示词和布局宽度，截取原生与 RN 同状态画面对照；实时视频用同一静态参考输入辅助比较，不能因画面内容不同跳过 UI 验证。
- 至少覆盖：首页顶部与下半页、相机预览、生成等待、远端首帧后、图片触控动图、参考图上传/失败、自由模式键盘、存储选择前/上传中/成功/失败。
- 核对卡片位置与尺寸、文字层级、圆角、边框透明度、选中状态、按钮热区、图片比例和安全区。OS 状态栏、系统弹窗与字体栅格差异允许存在，业务页面不能使用平台默认样式代替。
- 覆盖小屏 iPhone、常见全面屏 iPhone 和 Android 手机；检查 Android 返回键、导航条、键盘和相册 URI 权限。
- 截图及对照结果保存在 `Example/XLab/ui-baselines/`，随 UI 改动更新；完成标准为界面、交互和生命周期一起通过，不以“功能按钮能调用 API”代替 UI 对齐。

API 使用统一遵循 public-api.d.ts：页面退出使用 close 并将所注册的 set*Listener 置 null，不调用旧草案的 dispose/addListener/stopLocalStream。回前台恢复本地预览，不自动生成。
