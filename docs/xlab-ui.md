# Example/XLab UI 对齐要求

最新首页语言与较小字号见 [首页语言与字体对齐](xlab-localization.md)，其范围及字号覆盖本文较早的首页说明。

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
| 自定义轨迹 Renderer 示例 | 按后续要求展示首页卡片；当前仅 UI，标记待接入，不扩展 SDK Renderer API |
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

## Realtime 底部 UI 实施（2026-09-10）

此阶段最初按用户要求只还原 UI，随后接入参考图上传（见下一节）；上文的完整业务目标不代表所有功能已接通。`Example/XLab/src/realtime` 的 ControlPanel、ReferenceList 与 Catalog 替代摄像头页原来的单一“自由”面板。

- 默认换形象；六个分类顺序、名称、默认提示词及 51 条预设数据对齐当前 UIKit 源码。分类横向滚动，点击将目标分类移入可见区。
- 面板背景 #101010；分类高 36、字号 13、分类间距 14；参考图 50 × 50、间距 10、圆角 10，选中外描边 2 / #FF2E88 / 圆角 12。参考图滚动边缘有 32 宽渐隐，选中项滚动居中，再次点击取消；切分类保留单一选中项与列表滚动状态。
- 左侧添加按钮固定，系统选择器仅选择图片，插入本地缩略图到当前列表首位并选中。自由模式独立管理参考图，点击已有缩略图删除，取消选择器保留原状态。没有调用 COS、安全检测或参考图生成，不制造上传成功/失败状态。
- 触控动图只切换按钮提示与本地展示状态。自由模式输入行高 40、圆角 8、28 圆形按钮与粉色提交按钮，点输入区域显示 138 高多行编辑面板并避让键盘；收起保留草稿。
- 保留原有纯文本摄像头提交/停止线路；新增参考图 UI 不把 referencePath 传给 SDK。停止操作清除本地参考图选择与触控提示状态。

资源来源和数据指纹见 `Example/XLab/src/assets/realtime/README.md`。按用户要求仅做静态检查与双端编译，运行、键盘/系统选择器和视觉验收由用户完成，本轮不新增模拟器截图或原生依赖。

## Realtime 参考图上传（2026-09-10）

按后续要求接入 COS 与真实上传状态，覆盖分类列表和自由模式参考图：

- 选图返回后立即插入缩略图并标记 uploading；复制系统 file/content URI 到本页缓存，再调用首页 API Key/环境对应的 `XmaxClient.createStorageManager().uploadImage()`。对齐 iOS `startReferenceUpload`，不自动调用安全检测。
- 缩略图显示黑色 42% 遮罩和白色 loading；成功保存远程 URL 到 referencePath 并进入 ready，失败进入 failed 并显示可点击的重试图标。自由模式上传中/失败时禁止提交，失败点击缩略图重试，成功后可点击删除。
- 每张图使用独立 ReferenceUploadTask 和 AbortController。重试复用缓存、重复点击合并；移除或退出取消任务，忽略迟到结果，待复制/传输结束后只删除本页拥有的文件。摄像头关闭不取消独立参考图上传。
- 上传 loading 不改变摄像头 busy，也不启动生成。分类选图自动生成、自由模式 referencePath 传入生成请求及触控动图业务仍留待后续接入。

自动检查包含类型、Lint、格式和 27 项测试，其中 5 项覆盖参考图 loading 到成功、失败重试、重复点击、复制中退出、上传取消后迟到结果及任务隔离。按用户约定不操作真机或模拟器；云端有效凭据联调和运行效果由用户测试。

## 首页图片与渲染卡片（2026-09-10）

按用户要求补齐首页卡片 UI。生成管线依次为摄像头 `01 / CAMERA` 和图片 `02 / IMAGE.FILE`；SDK FEATURES 中自定义轨迹渲染位于存储服务上方，卡片间距为 14。

- 图片卡片沿用 iOS 标题、描述、`createLocalImageStream()` 文案和紫色 `#C9A3FF`，输入卡片连续编号。
- 自定义轨迹渲染沿用粉色 `#FF8FD8`、FX 水印、RENDER 图标及 CANVAS / MULTI-TOUCH / CUSTOM EFFECT 标签。SVG 原件复制并栅格化为本地多倍率 PNG，构建不依赖参考仓库。
- FeedPipelineCard 和 FeedFeatureCard 分别统一管线与功能卡片的布局；存储和摄像头保留原有导航。
- 图片推流与自定义 Renderer 尚未实现，两张新增卡片状态及操作区均显示“待接入”，同时禁用点击并声明无障碍 disabled 状态。卡片文案不代表公开 API 已实现，不进入相机页或模拟生成。

本轮只检查代码与编译，运行效果由用户验收。


## 图片线路与参考图生成接线（2026-09-10）

覆盖上一节图片卡片的待接入状态：图片卡片现可运行，首页校验 API Key 后打开单图选择器，取消留在首页，选择后进入 RealtimeScreen。该页面与相机复用状态、预览/远端覆盖、生成/停止和后台生命周期；图片模式使用 fit 预览并隐藏相机翻转，初始文案为“正在准备图片…”。

预设参考图选择会传入其 prompt/referencePath；自定义参考图选中后等待 COS ready 再提交一次；自由模式传入上传成功的参考图或 null。取消选择、停止、切分类和进入后台会清除尚未发起的选择请求，后台返回只恢复本地预览。图片生成不需要先将输入图片上传 COS，COS 用于独立的条件参考图。

自定义轨迹渲染卡片继续禁用；触控动图提示明确显示“暂未接入”，不伪造轨迹生成状态。普通图片生成可使用前四类参考图或自由模式。

新增原生图片处理，需要重新编译安装 XLab，Metro 热刷新无法添加原生方法。技术细节、编译结果与待真机验证事项见 [image-implementation.md](image-implementation.md)。


## 分环境配置持久化（2026-09-10）

XLab 通过 `src/configuration` 保存国内、海外独立 API Key，以及最后选择的环境。使用 react-native-keychain 10.0.0，仅为 Example 依赖，不改变 SDK API 或让 SDK 自动保存宿主凭据。

- 国内、海外分别使用 `ai.xmax.xlab.configuration.v1.china` / `.global`，环境使用 `.environment`。不从另一环境回退读取 Key。
- iOS 设置 WHEN_UNLOCKED_THIS_DEVICE_ONLY、关闭 cloudSync；Android 使用 Keystore AES-GCM（无交互认证）。无需每次输入或切换时弹出身份认证。参考 [Keychain 官方使用说明](https://oblador.github.io/react-native-keychain/docs/usage/) 和安装版本源码。
- 启动先恢复配置，完成后才允许输入；读取失败提供重试，不用空白配置覆盖原值。切环境时更新输入框并恢复隐藏状态，输入框按环境重新挂载，避免旧输入事件串到新环境。
- 每次修改立即更新界面并异步保存；同一项等待中的连续修改合并为最新值，各项串行写入。只持久化去除首尾空白后的 Key，清空/纯空白输入会删除当前环境项。
- 按用户要求，正常保存静默进行，不显示保存中或自动保存说明、不占额外行；仅失败时提示并可重试；待保存数据保留在内存。前后台变化会尝试补写未完成项，正常页面导航不重建配置 Store。
- 保存异步进行，系统强杀过程中尚未完成的写入不保证落盘。iOS Keychain 的卸载保留行为由系统决定，清空输入框是本例提供的删除方式。

本轮只做静态检查、逻辑测试和原生编译，由用户进行真机运行验收。新增安全存储原生依赖后需重新编译安装 XLab。

本轮 typecheck、ESLint、Prettier 和 36 项测试通过（新增 5 项配置隔离/恢复/竞态/重试用例）；iOS arm64 Debug/Release 无签名构建与 Android Debug/Release 构建均通过，包含 RNKeychain 自动链接和 Release JS 打包。未读取用户现有 Key 或操作设备，真机重启后的恢复效果由用户验收。


## Realtime 顶部控件与预览容器修正（2026-09-10）

逐项核对当前 UIKit `configureTopControls` / `configurePreview` / `configureControlPanel` 与 RealtimeLabeledActionButton，修正之前的文字字符按钮和全屏图片容器：

- 返回按钮：左侧 12、顶部安全区 +8，点击区 44 × 44，原版返回图标 32 × 32，不加圆形底色。
- 翻转按钮：右侧 8、顶部安全区 +6，单个操作区 58 × 62，图标 22 × 22，顶部内距 9；标签距图标 5、11pt semibold。RN 只保留已接入的翻转，图片模式不显示此按钮。
- 摄像头预览从页面顶部开始；图片预览从安全区顶部 +68 开始。两者底部均截止到控制面板上沿，不再让画面铺到面板下方。图片保留 fit；准备/连接 loading 位于同一预览区域中。
- 顶部按钮绝对定位，预览与控制面板通过纵向布局分配空间，适配不同安全区与面板高度。

本轮只核对源码尺寸并做静态检查/编译，未进行设备截图验收。相机切换的模糊/翻转动画未在本轮接入。


## RealtimeLoadingOverlay（2026-09-10）

按当前 iOS `RealtimeLoadingOverlay.swift` 还原：使用同一份 RealtimeLoading.gif，中央 54 × 50、aspect fit、72% 黑色遮罩，无可见提示文字；显示/隐藏均为 300ms ease-in-out，切换时从当前透明度继续，淡出结束卸载动画。覆盖预览区域，不拦截点击。资源加载失败才回退为 86% 白色小型系统指示器。

初始媒体准备与连接/生成期间显示；完成、失败、停止、退出或后台时收起。loading 与操作禁用状态分开，翻转和停止过程不再误显示“正在连接”。SDK XmaxRealtimeVideo 移除内置系统转圈和等待文字，保留原来的任务确认/显示事件门控及远端淡入；加载 UI 归 Example，与 iOS 分工一致。首帧显示的既有验证边界仍见 camera-implementation.md。

Android 按 [RN Image 官方说明](https://reactnative.dev/docs/0.83/image#gif-and-webp-support-on-android) 增加 Fresco animated-gif；版本 3.7.0 来自已安装 RN 0.87.1 的 gradle/libs.versions.toml。仅 XLab app/build.gradle 引入，因此 Android 本轮需要重新编译安装，单纯 Metro 刷新不能添加 GIF 解码器。iOS 使用 RN Image 已有支持。

按约定只检查代码与编译，动画流畅度、加载到画面切换及快速退出/后台效果由用户运行验收。

本轮 typecheck、ESLint、Prettier、36 项既有测试全部通过；iOS arm64 Debug/Release 无签名构建、Android Debug/Release 构建通过，并核对两端 Release 包中 GIF 与源文件逐字节相同。Android 首次构建遇到共享 Metro 临时缓存冲突，改用独立构建临时目录后通过，未停止用户的 Metro。

Realtime 错误提示使用绝对定位的悬浮 toast，位于顶部安全区域以下，不参与预览或底部面板布局。普通错误 6 秒自动消失；带「重试」或「打开设置」的提示保留到操作或手动关闭，避免恢复入口自动消失。长文案可在 toast 内滚动，重复报错刷新计时，页面卸载清理计时器。未进行本次设备 UI 验收。
