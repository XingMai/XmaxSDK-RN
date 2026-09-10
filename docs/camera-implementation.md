# 摄像头线路实现与验收

2026-09-10。当前分支 `feature/yueting-v1.0.0`，开发阶段 0.0.1。摄像头业务已落地，真实服务端生成、最低系统和 iPhone 媒体验收仍待完成；本文件区分实现、构建与实际运行证据。

## 范围与 iOS 对齐

- Core：XmaxClient、XmaxRealtimeManaging、RealtimeCoordinator、连接 / 生成 Manager。
- Service：HTTP envelope / runtime headers、session 创建 / 10 秒心跳 / 关闭、MediaServicing 输入尺寸规则。
- Media / Stream：832×1472@24 默认前置相机、可选麦克风、翻转、编码规格、RTC 入房 / 发布 / 订阅、房间 10 秒心跳和 start / change_condition / stop。
- Render：稳定轨道句柄、同 owner 校验、失效通知、厂商原生视频视图、远端实际 rendered 回调与任务 SEI 分别确认、0.3 秒淡入。
- Foundation：厂商适配、权限、统一错误、按 Client 配置过滤的业务状态 / 性能日志；不输出提示词、Key 或鉴权头。
- 原生小模块：TurboModule / Codegen、相机权限、RTC owner 租约、进入后台 / runtime 销毁时直接销毁自有 RTC 引擎。HTTP 和生成控制没有复制到 Swift/Kotlin。

参考 iOS 源码 HEAD 在快照时为 `f6b02899a867ebf9e2a2e1181317a20e4db78bbd`，工作区含后续修改。实施读取的文件指纹见 [camera-ios-reference.json](camera-ios-reference.json)。iOS 任务 ID 保持快照里的 `task-${base64urlUUID}?os=ios`。2026-09-10 按用户调试要求，Android 暂时去掉 `?os=android`，使用 `task-${base64urlUUID}`；发送的 start / change_condition / stop 和接收的 SEI 确认使用同一个无后缀 ID。SEI 只接受完整 taskID 或追加 `&index=<数字>`，并匹配 room / bot，不兼容旧的 Android OS 后缀。runtime.platform 仍为 android。

本轮没有 createLocalImageStream、createStorageManager、轨迹交互 / isInteractionEnabled、COS、插帧、本地视频、Web 或 Expo 入口。这些仍在完整目标契约里，但不会导出无功能 API。当前导出以 `src/index.ts` 和构建生成的 `lib/typescript/index.d.ts` 为准；公开声明的正负调用覆盖在 `tests/camera-api.ts`。

## 操作语义

`connect({localStream})` 只创建 session、入房并发布相机；远端流可先绑定到视图。新任务的 startGeneration 等匹配 SEI，等待上限 30 秒。已生成时传新 context 发送同任务的 change_condition，成功发送即返回；传 null / 省略复用缓存，referencePath 省略或为空会清空参考图。更新发送失败保留原任务和已成功应用的 context。

翻转保留同一个本地 videoTrack；生成中先停止旧任务、切相机并按 iOS 等待 500ms，再用缓存条件创建新 taskID。失败清理连接，保留本地预览。disconnect 停止发布、麦克风、房间与 session，close 额外停止相机并销毁 RTC；close 可重入且 Manager 可复用。相机没有本地音频预览，localAudioVolume 为 0，setter 只做范围校验；创建相机后 remoteAudioVolume 为 0，可调到 1。

关闭会立即中断等待确认、开始停止本地采集；已发出的 POST 允许结束，若迟到返回 session 则继续 DELETE 回收。网络请求自身 15 秒超时。重复 close 等待同一收尾；DELETE 失败也不跳过本地释放。后台直接关闭媒体，前台恢复只重新开预览。宿主监听器同步抛异常不会中断 SDK 清理。

## XLab

首页配色、模型卡片、摄像头页全屏视频、顶部返回 / 翻转、底部自由提示词和停止按钮按 iOS UIKit 基线实现。当前只展示已接入的摄像头自由输入；参考图上传和其余示例入口随对应线路再实现，不代表完整 XLab UI 已验收。

首页 Key 仅驻留 App 内存。空 Key 可看预览；生成前需要输入有效 Key。Example 先 connect 并挂载 remoteTrack，再发送 start，避免错过初次远端 rendered 回调。修改原生代码 / 依赖需重新编译安装，Metro 热更只适用于 JS。

## 工程修补

固定 RTC RN 1.3.2，iOS VolcEngineRTC 3.58.1.51400，Android 3.58.1.55100，VolcApiEngine 1.6.6；未引入第二套 RTC 版本。自有原生后台模块直接调用厂商销毁方法，因此声明相同版本依赖。

模拟器实测发现 IEngine.setVideoEncoderConfig 的普通对象声明与运行时不一致：实际要求 VideoEncoderConfig 原生对象，Android 编码 / 镜像 helper 还返回 Promise。Foundation 现在使用原生配置对象并 await，错误会向上 reject，避免无声跳过编码设置或产生未处理 Promise。

开发期补丁记录与许可证原文在 [vendor-patches](../vendor-patches/README.md)，根 prepare 自动复现；未使用手工-only node_modules 补丁。SDK 仍 private，正式消费者需要独立可安装的厂商修订版本。

Android 的 dependencyInsight 证实 `VolcEngineRTC:3.58.1.55100 → com.android.support:appcompat-v7:28.0.0` 导致 AndroidX 重复类。XLab 对该实际需求启用 Jetifier；Gradle 默认 2GB heap 在转换 React AAR 时不足，调整为 4GB。未使用 pickFirst / 排除二进制掩盖冲突。Android Release 另显式配置 hoisted hermes-compiler 路径，避免 RN 默认只在 XLab 根目录查找编译器。迁移依据：[Android 官方说明](https://developer.android.com/jetpack/androidx/migrate)。

SDK 的 strict / noUncheckedIndexedAccess / exactOptionalPropertyTypes / skipLibCheck=false 保持启用。RN 0.87 自动生成的 Strict API 声明在当前依赖组合中存在上游声明冲突；本轮通过官方 `react-native-legacy-deep-imports` condition 选择手写兼容声明，并使用 ES2022 lib 避免 DOM 与 RN globals 重叠。运行时仍是 RN 新架构，不能把这项检查报告成 RN 自动生成 Strict API 已通过。[RN 官方类型条件说明](https://reactnative.dev/docs/strict-typescript-api)。

## 已完成检查

| 检查 | 结果 |
| --- | --- |
| SDK / XLab typecheck、ESLint、Prettier | 通过 |
| CommonJS / ESM / 声明构建 | 通过 |
| 输出声明的公开 API 正 / 负调用 | 通过 |
| 协议、尺寸、取消与生命周期测试 | 15 项通过，替换原生边界和 HTTP，运行真实 TS 控制层 |
| iOS Pods / Codegen / 自动链接 | 通过，RTC / XmaxRuntime 都已链接 |
| iOS arm64 Debug / Release | 编译通过，CODE_SIGNING_ALLOWED=NO；Release 包含 JS / Hermes 打包 |
| Android arm64 Debug / Release | assembleDebug / assembleRelease 通过，Java / Kotlin / C++ Codegen 和 Hermes 打包通过；沿用示例 Debug 签名，R8 尚未启用 |
| 隔离源码副本 npm ci | 通过，726 个依赖包安装，prepare 自动重放厂商补丁，6 个补丁目标文件哈希与当前工作区一致；不是外部 tarball 原生宿主验收 |
| Android Pixel_10 / API 37 模拟器 | Fabric 首页、相机权限、RTC 虚拟摄像头预览和翻转运行通过；系统 camera ID 从 1 切到 10；退后台和返回首页后相机占用为空，回前台恢复预览 |
| Android JS 忙碌时退后台 | 通过：Hermes JS 连续忙碌 8 秒，约 1409ms 时系统 Active Camera Clients 已为空，8 秒后 JS 检查完成；只验证模拟器 |
| npm pack 文件清单 | 179 文件，约 400KB 未压缩；不含构建缓存、AAR / so 或密钥 |

本机使用 Node 26.3.1、Xcode 26.6、CocoaPods 1.17.0、JDK 17、AGP 9.2.1、Gradle 9.4.1、NDK 27.1.12297006，Android compileSdk 37 / targetSdk 36 / buildTools 37.0.0。部署目标 iOS 15.1 / Android API 26 是工程目标，尚无最低系统实机验收。

## 待验收 / 已知边界

1. 真实 iPhone / Android 相机、麦克风、首帧显示和后台行为；有效 Key 下无输入 SEI 的 session → start → 回传任务 SEI → 视频显示端到端联调。没有实际服务响应时不降低成功条件。
2. 服务端心跳过期回收：原生 destroy 仅保证本地媒体停止，不等于远端 session DELETE 成功或停止计费。
3. 当前火山 iOS 二进制没有 arm64 模拟器切片，只有真机 arm64 和模拟器 x86_64。Apple Silicon 原生模拟器 RTC 构建失败；优先真机，不通过升级未审核 RTC 或全局排除 arm64 假装修好。Rosetta 模拟器未验收。
4. 厂商 rendered 回调是流首帧事件，当前已绑定视图上的连续任务可复用真实显示状态；同一远端流销毁视图后重新挂载是否再次回调尚未验证。当前不把 onLoad / decoded 历史事件当显示成功。2026-09-10 对齐 iOS 分工后，SDK 视频组件不再自带 loading 和 40 秒提示；XLab 负责生成等待与操作错误展示。必要的逐绑定原生显示事件仍是发布前缺口。

## 远端画面切换修正（2026-09-10）

RN 的对应组件为 `XmaxRealtimeVideo`，没有单独导出 UIKit 名称 `XmaxRealtimeVideoView`。XLab 已使用该组件保留本地底图，并等待 SEI 确认与匹配的 rendered 事件后淡入远端画面。

针对用户反馈的生成开始时闪烁，修正两个代码时序风险：VideoSurface 的首次绑定和内容模式 effect 原来会连续调用两次 native bind；现在由内部 VideoSurfaceBinding 管理单次绑定，同一模式不重复设置。远端层按内部轨道标识独立创建透明度值，从首次提交就为 0，避免新轨道继承旧层透明度后再由 effect 清零。淡入为 300ms ease-in-out；重复显示通知不重启动画，卸载取消旧动画和事件订阅。

本次保留 SDK 公开 API、XLab loading 归属与显示确认条件。新增 6 项回归测试覆盖重复绑定、两种确认顺序、重复通知、错误流/decoded 过滤、卸载后迟到事件、绑定失败。typecheck、ESLint、Prettier、46 项测试及 Android/iOS Release JS 打包通过；未操作设备复现云端生成，实际闪烁是否消除仍由用户验收。

### 临时关闭视频切换动效

按用户后续要求，远端层移除 Animated.timing 与 300ms 淡入，改用普通 View 的透明度 0/1 直接切换，以排查闪烁是否来自动效。继续等待任务确认与匹配的 rendered 事件，继续按轨道独立初始化显示状态。本节覆盖上文的淡入描述；XLab loading 动画独立于视频切换，本次未改动。
5. 同一轨道只支持一个活动厂商 canvas；新绑定接管后旧视图卸载不会解绑新视图。不承诺同流多画布。
6. 干净外部宿主安装、最低系统、完整 XLab 截图对照、R8 混淆、所有 ABI / 16KB page-size、许可证及可发布厂商修订包仍需验收。

本机详细日志在 `/private/tmp/xmax-rn-bootstrap/camera-*`，属于本轮临时诊断产物。仓库不提交编译缓存或设备凭据。
