# React Native 架构标准

2026-09-09。路线确定为 **TypeScript 业务 + 火山/腾讯 RN SDK + 必要的小型原生适配**。分层、核心类名和控制职责对齐当前 iOS XmaxSDK；不依赖已有 iOS/Android XmaxSDK，也不在 RN 仓库重写整套 Swift/Kotlin 业务。首版只面向 RN/Expo 手机应用，不设计 Web 包或 Web 适配层。

## 1. 对齐关系

| iOS 层 | RN 同名层及职责 |
| --- | --- |
| Core | XmaxClient 组装服务；XmaxRealtimeManager 对外编排；RealtimeCoordinator 管操作、状态、取消；Connection/Generation Manager 拆分连接和生成 |
| Service | ApiService、RealtimeSessionService（含 session 心跳）、StorageService、MediaService；保存业务协议和数据类型 |
| Media | MediaController、CameraController、ImageController、InteractionController；输入切换、图片准备、相机与交互 |
| Stream | StreamController、RoomController/RoomEvent/RoomHeartbeat、EncodingController；RTC 房间、信令、编码和 SEI 确认 |
| Render | RenderController、VideoRenderRegistry/Binding、XmaxVideo/XmaxRealtimeVideo、轨迹显示；管理视图和轨道绑定 |
| Foundation | RtcManager、StorageManager、文件/图像/权限、日志/错误/runtime；封装厂商和系统依赖 |

内部实现类和它的依赖协议沿用 iOS，例如 XmaxRealtimeManaging、MediaControlling、StreamControlling、RenderControlling、ApiServicing、RtcManaging。只导出 iOS 对应的首版公开协议，内部 Controller 和 RtcManaging 不成为宿主扩展 API。

依赖方向：Core 组合 Media/Stream/Render 和 Service；它们调用 Foundation 协议；Foundation 的具体适配调用厂商 RN 模块/必要原生模块。依赖通过构造注入，Foundation 不反向引用 Core 或 Example。内部事件从适配层向上通知，不通过反向 import 控制业务。

```text
React 页面 → XmaxClient → XmaxRealtimeManaging / XmaxStorageManaging / MediaServicing
                              ↓
                     TS Core / Service / Media / Stream
                              ↓
                     Foundation RtcManager / StorageManager
                              ↓
                     火山 RTC RN / 腾讯 COS RN → 系统原生 SDK
React 页面 → XmaxVideo / XmaxRealtimeVideo → RenderController → RTC 原生视图 / RN Image
```

## 2. 目录和所有权

以下是实施时的目标结构；当前已落地摄像头所需的 Core、Service、Media/Camera、Stream、Render 与 Foundation，Example/XLab 接入首页和自由提示词摄像头页；图片/存储/轨迹目录仍按后续实际实现创建。

```text
XmaxSDK/
├── src/
│   ├── index.ts
│   ├── Core/
│   │   ├── XmaxClient.ts / XmaxConfiguration.ts / XmaxEnvironment.ts
│   │   ├── Realtime/
│   │   │   ├── XmaxRealtimeManaging.ts / XmaxRealtimeManager.ts
│   │   │   ├── RealtimeCoordinator.ts / RealtimeConfiguration.ts / RealtimeModel.ts
│   │   │   ├── XmaxRealtimeConnectionManager.ts / XmaxRealtimeGenerationManager.ts
│   │   │   └── RealtimeErrorHandler.ts / RealtimeTiming.ts
│   │   └── Storage/                     # XmaxStorageManaging / XmaxStorageManager / 结果类型
│   ├── Service/
│   │   ├── Network/                     # ApiServicing / ApiService / ApiLogger
│   │   ├── Realtime/                    # RealtimeSessionServicing / RealtimeSessionService、流/轨道/状态类型
│   │   ├── Storage/                     # 临时凭据、安全检查业务
│   │   └── Media/                       # MediaServicing / MediaService
│   ├── Media/
│   │   ├── MediaControlling.ts / MediaController.ts
│   │   ├── Camera/                      # CameraController
│   │   ├── Image/                       # ImageController；准备图片与 dummy capture
│   │   └── Interaction/                 # 轨迹采样、坐标映射、任务关联
│   ├── Stream/
│   │   ├── StreamControlling.ts / StreamController.ts
│   │   ├── Room/                        # RoomController / RoomEvent / RoomHeartbeat
│   │   └── Encoding/                    # EncodingController
│   ├── Render/
│   │   ├── RenderControlling.ts / RenderController.ts
│   │   ├── Video/                       # XmaxVideo.tsx / XmaxRealtimeVideo.tsx / 绑定注册表
│   │   └── Trajectory/                  # 内置轨迹展示
│   └── Foundation/
│       ├── RTC/                         # RtcManaging / RtcManager / 回调转换与 Engine 所有权
│       ├── Storage/                     # StorageManaging / StorageManager / COS 适配
│       ├── File/ / Media/ / Permissions/
│       ├── Lifecycle/                   # AppState、原生兜底同步与失效标识
│       ├── Logging/ / Errors/ / Runtime/
│       └── Native/                      # 仅必要的小模块及 Codegen spec
├── ios/                                # 文件/权限/后台兜底，按实际缺口增加视图事件
├── android/                            # 同等职责；不放 HTTP 或整套生成状态机
├── vendor-patches/                     # 已审核上游补丁、来源和复现说明
├── Example/XLab/                       # RN 0.87.1 主示例，UI 对齐 iOS UIKit
│   ├── src/                            # 页面、theme、资源、示例生命周期
│   ├── ios/ / android/
│   └── ui-baselines/
├── tests/                              # iOS 对照 fixture、操作竞态、类型和发布包验收
├── docs/
├── package.json / tsconfig.json / react-native.config.js
├── XmaxReactNativeSDK.podspec            # 仅本包小型原生适配
└── README.md
```

本包不直接再声明第二套 RTC/COS 原生版本，厂商 RN 包负责其 Pods/Maven 依赖。只有确实需要直接链接厂商头文件的原生补充才声明同版本依赖，并检查最终依赖图去重。文件按 iOS PascalCase 类名命名，平台实现用 .ios/.android 后缀；不用一个上千行的 NativeAdapter 集中所有业务。

## 3. TS 与原生边界

TS 负责公开 API、HTTP、session 心跳、房间 JSON、任务确认、错误、配置、存储业务、模型尺寸规则和 UI。媒体采集、编码、传输、解码、视频显示由厂商原生 SDK 执行；不把像素/PCM/Base64 放进 JS 事件或每帧跨边界。

图片线路固定使用 setDummyCaptureImagePath。Foundation/File 将 fileURL 转为有效绝对路径；ImageController 统一方向、输出尺寸及本地预览。图片没有本地 RTC 预览，因此 Render 使用 RN Image。stopVideoCapture 会激活 dummy 图，不能把它单独当作停止图片推流：关闭/切源必须清空 dummy 路径并正确取消发布、解绑。

首版不主动发送 SEI；接收服务端 SEI 并匹配 taskID/roomID/bot 仍保留。RTCRoom 消息和 HTTP session 均按 iOS schema，10 秒双重心跳独立；TS timer 用于前台，不承诺后台维持。包内不引入插帧和文件视频输入。

小型原生模块限定于厂商 RN 不覆盖的文件/权限和生命周期能力。原生后台兜底必须能直接停止被登记的引擎/房间，不能只发一个需要 JS 接收的事件。登记包含 owner 和 generation token；与 TS close 幂等协作，旧释放请求不得销毁新引擎。无法取得厂商引擎所有权时应修补其生命周期适配，不能另建一个不相关 RTC engine 冒充兜底。

视图级显示确认若无法由厂商回调可靠提供，只补该事件/绑定能力。默认复用厂商 ViewManager 的新架构互操作，不提前重建整套 Fabric 渲染器；自有新增模块使用 TurboModule/Codegen。

## 4. 生命周期与竞态标准

RealtimeCoordinator 按 iOS 接纳单个实时操作，记录操作 token、取消信号和失败影响范围。连接/生成/媒体切换冲突时明确拒绝，不无限排队。关闭可抢占等待房间/首帧的操作；close/disconnect 重复调用等待同一个收尾任务。

连接事务记录已创建 session、room、已发布源，失败逐项回滚。即使网络 DELETE 失败也要释放本地资源；迟到 POST 成功仍应回收对应 session。关闭不删除仍供本地预览使用的输入，只有 close/匹配 stopLocal 方法使它失效。远端句柄在 disconnect 失效，所有媒体句柄在 close 失效。

Controller 更新状态后再交付监听器。内部事件带 manager/operation/token，过滤上一生命周期和上一任务事件；多个 Manager 可存在，但首版只允许一个活跃 RTC/媒体拥有者，不能在引擎抢占时悄悄关闭另一个 Manager。界面卸载只解绑渲染；页面负责 close、置空所有 listener 及 track state。

后台策略对齐 iOS XLab：真正 background 时 close，回前台恢复本地预览且不自动生成。保持参考图上传的独立生命周期。JS runtime 销毁时原生释放媒体；服务端心跳过期回收必须联调，不宣称本地 destroy 等于服务端已停计费。

## 5. 渲染和协议验收

生成确认、远端流首帧、当前视图显示分别维护。首帧回调不能在同房间多次生成中当成每次都会发生；onLoad 只表示视图注册。轨迹坐标、缩放黑边、相机镜像、图片方向与实际传入模型的内容一致。

所有厂商类型停留在 Foundation；公共 API 不出现 RTCVideo、COS service、native tag 或 vendor event。公开名称和返回值以 public-api.d.ts 为准，导出改动需同时更新 iOS 映射和类型调用 fixture。

## 6. 实施顺序

1. 先完成固定版本的普通 RN Hello World 工程，再安装 RTC/COS，修正已定位的构建问题；完成 Codegen、自动链接和 Debug/Release 构建。
2. 实现 XmaxClient 和同名协议，按 Core/Service/Media/Stream/Render 分层打通相机/图片 → 连接 → 生成确认 → 展示 → 断开 → close。
3. 完成生命周期兜底、同房间连续任务、输入切换、轨迹、音量/质量回调和存储业务。
4. Example/XLab 对齐 iOS UIKit；从 npm tarball 安装普通 RN 宿主，完成最低系统与真机验收后才发布支持矩阵。

依赖版本、构建环境、发布条件统一维护在 [engineering-baseline.md](engineering-baseline.md)，能力证据参照 [vendor-rn-audit.md](vendor-rn-audit.md)。

当前阶段 Expo 工程、config plugin 和专门版本验收全部延后。同一 RN SDK 保留后续接入可能，不另写 Expo 业务层。

## 摄像头阶段实现

当前范围、iOS 源码快照、厂商修补与验证边界见 [camera-implementation.md](camera-implementation.md)。原生仅实现权限、owner 租约、后台销毁和 runtime 信息；生成协议与 HTTP 仍在 TypeScript。
