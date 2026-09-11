# FeedScreen 样式对齐验收

最新首页已新增语言菜单、中英文文案和较小字号，见 [实现记录](../../../docs/xlab-localization.md)。本目录现有截图为旧版；本轮未补录设备截图，不能用旧图证明新的双语布局已验收。

2026-09-10。下方首页记录来自摄像头阶段；新增存储入口与页面记录见本文末尾。

## 参考

以 iOS XmaxSDK 当前 UIKit 源码为准（参考仓库 HEAD `b112758`），不是按旧截图中的版本与平台文案复制：

- `Examples/XLab/XLab/Modules/XLFeed/FeedViewController.swift`
  - SHA-256：`8a90ea1cf50d380de438b8a4a2cb79be3a9064734f46f20379c6d2d384eeb22d`
- `Examples/XLab/XLab/Modules/XLFeed/FeedComponents.swift`
  - SHA-256：`47a786d4a88ea0ee400f59bee43fd0cb053fc5a6c0ae3783f3efba3a2dbb5f45`
- 辅助视觉参考：iOS 仓库 `docs/images/xlab/home.jpg`。

对应实现：`../src/screens/FeedScreen.tsx`。图标来源及转换方法见 `../src/assets/feed/README.md`。构建不依赖参考仓库或转换工具。

## 对齐内容

- 菱形品牌标识、版本胶囊、三段背景渐变及蓝/绿光晕。
- 页边距 18、顶部 20、品牌到介绍卡片间距 34；字体按 UIKit 的 1.15 倍换算。
- 介绍卡片、66 高指标行、API Key 与模型合并卡片；描边、圆角、间距及选中模型状态。
- 摄像头卡片的 MODE_01 / CAMERA、READY、01 水印、左侧色条、API 标签与运行按钮。
- 分隔线、版权与邮箱页脚。

适应 RN 当前范围：品牌副标题显示 React Native；版本来自 XmaxSDKInfo；运行平台和最低系统显示实际 RN 工程配置。保留国内/海外选择，压缩放入 API KEY 标题行。只展示已实现的 X2.0 和摄像头入口。模型标识使用 RN 公开名称 `RealtimeModel.x2_0`。

## 已检查

Android Pixel_10 模拟器，API 37 / 420 dpi，RN 0.87.1 Debug：

| 截图                          | 尺寸                       | 检查内容                                     |
| ----------------------------- | -------------------------- | -------------------------------------------- |
| `feed-android-top.png`        | 1080 × 2424，约 411 dp 宽  | 品牌、介绍、指标、API Key、模型、摄像头卡片  |
| `feed-android-bottom.png`     | 同上                       | 摄像头操作行与页脚                           |
| `feed-android-320-top.png`    | 临时 840 × 1800，320 dp 宽 | 窄屏排版、指标标签单行缩放、说明文字自然换行 |
| `feed-android-320-bottom.png` | 同上                       | 完整操作行、页脚可滚动查看                   |

交互：国内/海外单选状态正确；API Key 显隐后系统输入框 password 状态与按钮可访问标签同步；点击运行进入现有摄像头预览并可返回。未输入或保存真实 API Key，未发起云端生成。模拟器尺寸已恢复。

`npm run typecheck`、`npm run lint` 通过，修改文件通过 Prettier 检查。未增加原生依赖，不需要重新编译宿主即可通过 Metro 更新。

本次未做 iOS 真机视觉验收：当前 RTC 二进制缺少 Apple Silicon iOS 模拟器切片。Android 与 iOS 字体栅格和系统安全区存在平台差异；不能将 Android 截图视为 iOS 真机验证结果。

## 存储入口与页面

2026-09-10，增加 `StorageFeatureCard` 与 `StorageScreen`，参考当前 iOS FeedFeatureCard 和 XLStorage/StorageViewController。参考文件指纹、依赖和完整验证边界见 `../../../docs/storage-implementation.md`。

同一 Android API 37 模拟器、1080 × 2424 / 420 dpi 的开发截图：

- `storage-android-feed.png`：首页 SDK FEATURES、橙色存储卡片、IMAGE/VIDEO/REMOTE URL 标签和进入按钮。
- `storage-android-empty.png`：存储页面顶部栏、STORAGE PIPELINE、STEP 01、系统选择入口和空元数据。

已实际检查入口/返回、系统图片选择、图片预览及尺寸/大小展示、空 API Key 上传提示。视频测试素材的异常元数据被选择器拒绝并显示错误，尚未完成有效视频的运行验收；没有将该错误截图记作成功基线。最后按用户要求停止运行测试，剩余有效视频、上传结果/复制、窄屏与 iPhone 交互由用户验收。

静态检查及 iOS/Android Debug、Release 编译均通过。此次新增 COS、文件选择、视频预览和剪贴板原生依赖，需要重新编译安装宿主。

## Realtime 底部面板 UI

2026-09-10，参考 UIKit RealtimeControlPanelView、RealtimeReferenceListView、RealtimePromptFieldView 和 RealtimePromptKeyboardView，还原六类入口、51 条参考图数据、横向列表选择/取消、添加本地图预览以及自由模式编辑面板。具体范围见 `../../../docs/xlab-ui.md` 末节。

本轮只接本地 UI 状态，参考图上传与生成没有接入。按用户要求完成代码和编译检查，运行与视觉验收由用户进行；没有新增截图，也不把原有摄像头阶段截图当作本轮验收结果。

后续已接入参考图普通 COS 上传：分类缩略图和自由模式小圆图均增加 uploading/ready/failed 状态、loading 遮罩和失败重试；自由模式等待上传成功后才允许提交。见 `../../../docs/xlab-ui.md` 的“Realtime 参考图上传”一节。本次仍由用户进行运行与视觉验收，无新增截图。

## 首页新增卡片（2026-09-10）

补充图片生成管线与自定义轨迹渲染卡片，位置、文案、主题色、图标和尺寸以当前 iOS FeedViewController / FeedComponents 为准。RN 省略本地视频管线，图片编号为 02。新增卡片当前标记“待接入”并禁用，摄像头和存储导航保留。按用户约定，本轮不运行设备或补录截图，视觉验收由用户完成。


## 图片生成接线（2026-09-10）

图片卡片由“待接入”改为可运行；选图后进入共享 RealtimeScreen，图片 fit 预览、隐藏翻转按钮，并复用生成等待/停止与参考图面板。预设参考图及自由模式已经传入生成请求；触控动图与自定义 Renderer 仍未接入。本轮只做代码检查、逻辑测试和双端编译，不添加运行截图。后续对照重点为横竖图/EXIF 方向、准备时退出、前后台、远端首帧和参考图上传后生成。


## 分环境 API Key 保存（2026-09-10）

首页国内/海外分别恢复各自的 Key，切换后默认隐藏。启动增加短暂的配置恢复状态，读取失败可重试；正常保存不显示额外说明或占位，仅失败时在帮助行下提供提示和重试。新增 RNKeychain 原生依赖需要重新安装 App。本轮不运行设备，人工验收包括双环境输入、切换、重启恢复、清空单侧、快速切换和读取/保存失败。


## Realtime 顶部与容器（2026-09-10）

返回/翻转改为 iOS 原始图片资源和尺寸；图片内容容器改为顶部安全区 +68，预览底部对齐控制面板顶部。相机仍从页面顶部展示，图片仍为 fit。按用户约定由用户检查模拟器/真机视觉，无新增运行截图。


## Realtime loading（2026-09-10）

复用 iOS RealtimeLoading.gif，中央 54 × 50，72% 黑色遮罩，300ms ease-in-out 淡入淡出，无加载提示文字；遮罩只覆盖预览区域且不拦截点击。SDK 视频组件内的第二层 loading 已移除。Android XLab 新增 animated-gif 3.7.0，需要重新安装；本轮不启动设备，不新增截图，运行验收由用户完成。
