# 厂商 RN SDK 能力与兼容性核对

日期：2026-09-09。核对对象是“TypeScript 实现 Xmax 业务，调用厂商 RN SDK”的路线。首版不包含插帧、createLocalVideoStream。这是历史能力核对记录；当前确定的工程标准以 engineering-baseline.md、architecture.md 和 public-api.d.ts 为准。

后续范围调整：用户已明确 RN 首版不主动发送 SEI，因此下文“输入逐帧 SEI 对齐”不再是首版准入条件；接收服务端 SEI 用于任务确认是独立能力，保留，服务端在无输入 SEI 时的返回行为仍需联调。图片线路现已改为 iOS / Android 原生外部帧输入，具体实现见 image-implementation.md；下文静态图片接口为初始依赖核对记录。发布包两端的平台专属声明均有 pushExternalVideoFrame，但顶层跨平台 RTCVideo API 未暴露可直接从 TS 构造并推送像素帧的完整链路，不能把声明存在视为已可用。

接入目标补充：普通 RN 与 Expo 自定义 development/production build 均可作为支持目标，具体 RN/Expo 版本需分别验证；Expo Go 不包含火山/COS 原生模块，不能运行本 SDK。TypeScript 编写业务不消除厂商原生依赖。Expo CNG 接入应提供 config plugin 管理原生工程配置，见 [Expo 自定义原生代码说明](https://docs.expo.dev/workflow/customizing/)。

已完成：读取 npm 实际发布包的公共类型、JS 平台适配、原生模块和构建配置；对照本地 iOS XmaxSDK；使用 `@react-native/codegen@0.87.1` 解析并生成双端模块代码。未完成：完整 XLab 原生构建、真机运行、Xmax 服务端联调。因此“接口存在”与“端到端通过”分别记录。

## 1. 结论

| 核对项 | 结论 | 尚未闭合的部分 |
| --- | --- | --- |
| 图片持续作为视频帧输入 | 火山 RN 公开接口支持，由原生 RTC 持续发帧 | 图片预览需单独显示；输入逐帧 SEI 对齐已从首版范围移除 |
| 房间信令 | 所需消息通道齐全，JSON 协议可由 TS 实现 | 双重心跳、确认超时、乱序过滤、退出收尾属于 Xmax 实现 |
| 首帧与生成确认 | 本地采集、远端解码/渲染首帧、SEI 接收接口均存在 | 首帧不是本次任务确认；也不是每次视图重新绑定后的显示确认 |
| 渲染控制 | 视图绑定、模式、背景、旋转、镜像等基础能力存在 | XLab 遮罩/轨迹/淡入、视图重新挂载、多次生成需真机验证 |
| 后台释放 | 显式停止采集、退房、销毁接口存在 | 不会自动执行 Xmax 会话关闭；严格释放要求不能仅依赖 JS 回调 |
| RN 0.87.1 新架构 | 三个发布包的模块 Codegen 均通过 | 已发现 Android 配置问题；视频视图依赖旧组件互操作，未验证完整兼容 |

判断：这条路线有可用基础，不需要因为“RN”就把整个 Xmax 业务重写成 Swift/Kotlin；但当前不能承诺未经修补的厂商包直接安装即可完全对齐 iOS。优先验证不发送输入 SEI 时的生成确认、视图显示与后台收尾，若有缺口，只补相应原生能力。

## 2. 实际版本

| 发布包 | 版本 | 包内默认原生依赖（普通 RTC 模式） |
| --- | --- | --- |
| `@volcengine/react-native-rtc` | **1.3.2** | iOS VolcEngineRTC **3.58.1.51400**；Android **3.58.1.55100**；两端 VolcApiEngine **1.6.6** |
| `react-native-cos-sdk` | **1.3.0** | iOS QCloudCOSXML **6.5.5**；Android cos-android **5.9.52** |
| `react-native-cos-sdk-nobeacon` | **1.3.0** | 专用 podspec 为 QCloudCOSXML/Slim **6.5.5**；Android cos-android-nobeacon **5.9.52** |

以上来自发布包的 podspec、Android build.gradle，不是用 RN 包版本推测原生版本。COS 两个变体二选一，不能同时安装同名原生模块。nobeacon 包还包含普通版 podspec，集成时需核对 autolinking 实际选中的 podspec。

现有 iOS XmaxSDK 使用 RTC 3.60.106.600、COS 6.5.7；Android 参考 SDK 使用 RTC 3.60.106.400、COS lite-nobeacon 5.9.52。**厂商 RN 包没有默认复用这套版本。** 不应强行升级其原生 RTC 依赖而不验证 VolcApiEngine 的适配。

发布包来源：[火山 RTC 1.3.2](https://registry.npmjs.org/@volcengine/react-native-rtc/-/react-native-rtc-1.3.2.tgz)、[COS 1.3.0](https://registry.npmjs.org/react-native-cos-sdk/-/react-native-cos-sdk-1.3.0.tgz)、[COS nobeacon 1.3.0](https://registry.npmjs.org/react-native-cos-sdk-nobeacon/-/react-native-cos-sdk-nobeacon-1.3.0.tgz)。后文的包内路径均相对于这些压缩包的 `package/`。

## 3. 图片输入

火山跨平台公开接口 `setDummyCaptureImagePath(filePath)` 位于 `lib/typescript/codegen/pack/api.d.ts:2645–2669`；发布包 JS 中也有 iOS/Android 两端方法分发，不只是原生文档提到。

工作方式：使用内部采集模式，设置视频编码尺寸/帧率/码率，设置图片路径并停止摄像头采集，RTC 将图片持续作为主视频流发布。清空路径或恢复摄像头采集可停止图片发送；重复调用可替换图片。帧率由原生 RTC 控制，不需要 JS 每帧读取图片或 setInterval 推像素。

边界：

- 支持本地绝对路径及资源路径，JPEG/JPG、PNG、BMP；不直接支持网络 URL。Android content URI、iOS 相册资源应先转为可读本地文件。
- 输出遵循编码尺寸和帧率；宽高比不一致时等比缩放并填黑边。需先统一方向、尺寸与裁剪规则，避免预览和模型收到的图像不同。
- **RTC 本地预览看不到这张静态图片。** XLab 需用 RN Image 显示本地输入，不能等本地采集首帧回调才宣布图片准备好。
- 不适用于自定义采集或屏幕流；镜像/滤镜对该图片不生效。

与 Xmax 的差异：现有 [StreamController.swift](/Users/xmax.ai/dev/Xmax/iOS/XmaxSDK/Sources/XmaxSDK/Stream/StreamController.swift:288) 在生成任务有效时，把任务 ID 作为 SEI 附到每一个外部输入帧。RN `sendSEIMessage` 可用，但一次调用只覆盖有限数量的后续帧，并非永久逐帧附加。用 JS 定时重复发送也不能保证没有空隙或切换任务时没有旧标记。

因此已经确认“持续发图片视频流”可实现；尚不能确认“保持原有逐帧任务标记语义”可直接实现。此差异不再要求首版补齐；现在的联调条件是确认不发送输入 SEI 时，服务端依然正常生成并回传任务确认。公共跨平台类型中没有找到可直接接受 JS 像素数据的 `pushExternalVideoFrame` 方法；不能把底层平台专属生成类型当成可用的跨平台 API。

## 4. 房间协议、首帧与显示

### 房间协议

`RTCRoom.sendRoomMessage(string)`、入房/退房、发布/订阅及房间事件均有公开封装。Xmax 的 `start`、`change_condition`、`stop`、`tracks`、`heartbeat` 都是 JSON，可按 [RoomEvent.swift](/Users/xmax.ai/dev/Xmax/iOS/XmaxSDK/Sources/XmaxSDK/Stream/Room/RoomEvent.swift:1) 用 TS 保持字段一致，包括 `uid`（任务 ID）、`user_id`、`params`、`runtime`。不插帧时不需要照搬插帧的目标尺寸控制。

RTC 房间心跳和 HTTP session 心跳是两条链路，参考实现均为 10 秒周期；RTC 连接正常不能代替 HTTP 心跳成功。创建/删除 session、超时关闭与失败回滚都要由 Xmax 协调，厂商 RN 库不会代办。

### 三类状态必须分开

| 状态 | 可用接口 / 依据 | 不能替代的状态 |
| --- | --- | --- |
| 本地采集首帧 | `onFirstLocalVideoFrameCaptured` | 图片文件已准备好、远端生成成功 |
| 远端首次解码 / 渲染 | `onFirstRemoteVideoFrameDecoded` / `onFirstRemoteVideoFrameRendered` | 当前任务 ID 已确认、当前新视图已显示 |
| Xmax 本次任务确认 | `onSEIMessageReceived`，匹配任务 ID、roomID、bot userID | 当前视图渲染完成 |

SEI 发送/接收有双端封装；消息类型是 ArrayBuffer，需验证 UTF-8 编解码及实际传输。参考 [生成确认代码](/Users/xmax.ai/dev/Xmax/iOS/XmaxSDK/Sources/XmaxSDK/Stream/StreamController.swift:525) 不是收到任意远端帧就 resolve `startGeneration()`，更不是 `sendRoomMessage()` 返回成功就 resolve。

火山文档在包内明确注明：主流的首次解码回调，在一次入房期间仅针对发布端第一次发布触发，重新发布不会再次触发。因此连续生成不能每次等待这个事件，否则可能一直 loading。渲染首帧事件也没有“每次 React 视图挂载都触发”的契约。

### 渲染控制与 XLab

可用接口：`setLocalVideoCanvas`、`setRemoteVideoCanvas`、`updateLocalVideoCanvas`、`updateRemoteStreamVideoCanvas`、本地/远端镜像设置。支持指定视图、缩放模式、背景和远端旋转；接口注释描述了空视图解绑，但部分 TS 参数未标 nullable，严格类型接入时需核对封装实际接受的值。

`NativeViewComponent` 的 `onLoad` 来自视图注册，**不表示已显示视频帧**。iOS Xmax [XmaxRealtimeVideoView.swift](/Users/xmax.ai/dev/Xmax/iOS/XmaxSDK/Sources/XmaxSDK/Render/Video/XmaxRealtimeVideoView.swift:114) 在每次重新绑定轨道后，等待该视图实际提交画面，再淡入远端层。这一点不能用 RN onLoad 或历史首帧状态直接替代。

要对齐 Example/XLab，还需验证：本地/远端层切换、loading 消失时机、返回页面重新挂载、同房间连续生成、轨迹坐标经过缩放/黑边/镜像后的映射，以及 RN 控件覆盖视频的触摸和透明度。Android 应优先试验 TextureView 对遮罩和淡入的支持，不能只看 SurfaceView 是否能播出画面。若要求每次绑定都有准确显示事件，而厂商层无法提供，补视图级原生事件。

## 5. 后台与资源释放

现有 iOS XLab 在 `didEnterBackground` 调用 `closeRealtime(cancelsReferenceUploads: false)`，回前台重新创建本地预览，不自动恢复生成，见 [RealtimeViewController.swift](/Users/xmax.ai/dev/Xmax/iOS/XmaxSDK/Examples/XLab/XLab/Modules/XLRealtime/UIKit/RealtimeViewController.swift:1188)。该行为是 XLab 实现，不能理解成火山 SDK 自带行为。参考图片上传也没有因实时会话关闭而被取消。

火山 RN 有停止采集、退房、销毁房间和 `RTCVideo.destroyRTCVideo()`；COS 有单任务取消及 service 级取消操作。但是本次读取的核心原生模块中未发现对应的后台/runtime 销毁收尾实现，不能据此保证自动释放，更不能保证 Xmax 的 HTTP session 已删除。

建议的对齐契约：

1. 应用真正进入后台时关闭实时 Manager；不要把 iOS 临时 inactive 或 Android 普通 Activity 重建一律当成永久 dispose。
2. 中止启动中的操作、停止双重心跳/媒体输入、解绑视图、发送业务 stop 并尝试删除 session、退房和释放资源。网络失败不能阻塞本地资源释放；旧异步结果不能恢复已关闭会话。
3. 保留可复用 Manager 的订阅，旧流句柄失效。回前台由 XLab 恢复本地预览，生成需要用户再次触发。
4. 实时 close 不应顺手取消共享 Client 上的所有 COS 任务；页面退出、实时 close 和内部传输清理分别明确所有权；当前公共 API 不提供 Client dispose。

TS 的 AppState 可以发起正常关闭流程，但 JS 线程阻塞、runtime 销毁或系统挂起时无法保证及时执行。若工程要求这些情况下仍停止本地媒体，需要原生生命周期兜底，并与 TS 共用幂等收尾状态。它不要求把 HTTP、协议和整个业务状态机全部搬到 Swift/Kotlin。

即使使用完整原生实现，进程被杀或断网时也不能保证 DELETE 送达。服务端必须有心跳超时回收机制；本次未读取服务端实现，超时时间及计费停止语义仍需确认。COS 原生传输可能继续工作，但凭据刷新回调依赖 JS，不能据此承诺任意情况下后台上传成功。

## 6. RN 0.87.1 新架构

### 已执行检查

以准确版本 `@react-native/codegen@0.87.1` 对三个发布包的 Native Spec 执行 schema 解析，再生成 Java、JNI/C++、Objective-C++ 模块代码：**三组均退出 0，生成的 schema 均包含实际模块。** 这不是仅检查 package.json 中有没有 codegenConfig，也不等于原生编译已通过。

复现步骤（在解压包同级，分别处理各包）：

```sh
npm install --prefix codegen-check --ignore-scripts --no-audit --no-fund @react-native/codegen@0.87.1
node codegen-check/node_modules/@react-native/codegen/lib/cli/combine/combine-js-to-schema-cli.js rtc-schema.json rtc/package/src/platforms/turboModule/NativeVertc.ts
node codegen-check/node_modules/@react-native/codegen/lib/cli/generators/generate-all.js rtc-schema.json VertcSpec generated/rtc com.volcengine.reactnative.vertc
```

COS 两个变体的 spec 是 `src/NativeQCloudCosReactNative.ts`，libraryName 为 `RNQCloudCosReactNativeSpec`，Java package 为 `com.cosreactnative`。每个变体独立生成。

### 已定位的问题与验证边界

| 项目 | 发布包证据 | 判断 / 处理 |
| --- | --- | --- |
| COS Android namespace | `android/build.gradle` 没有 namespace，仍仅有 manifest package | 现代 AGP 下需要补配置，不能认为原包可直接构建 |
| 火山 Java 语法级别 | `android/build.gradle` 指定 Java 8；`VertcViewManager.java:46` 起使用 var、switch 箭头语法 | 包内配置与源码不一致，需提高模块语言级别或改写语法 |
| 两包 BuildConfig | 自定义 buildConfigField，但模块未显式开启 buildFeatures.buildConfig | 需检查目标工程/RN 插件最终配置，并按需显式开启 |
| 火山视频组件 | JS 使用 requireNativeComponent；iOS 是 RCTViewManager，Android 是 SimpleViewManager；Codegen 只声明 modules | TurboModule 存在，但视图没有原生 Fabric Component Spec，依赖互操作层 |
| COS iOS 事件 | JS 以 `__turboModuleProxy` 判新架构；事件仍经 CosEventEmitter 和 NSNotification | 在目标 Bridgeless 下必须连同临时凭据刷新、进度、成功/失败事件一起验证，不能只调用初始化 |
| 视图/runtime 回收 | 没有在已检查的核心封装中看到完整解绑和 runtime 销毁收尾 | 需反复挂载、卸载、重载验证；尚不能据此断言存在泄漏 |

Android namespace 及 BuildConfig 的要求见 [AGP 8 变更说明](https://developer.android.com/build/releases/agp-8-0-0-release-notes)。这是源码核对定位的问题，尚未以完整 Gradle 构建复现错误日志。

RN 0.87.1 [TurboModuleBinding.cpp](https://github.com/facebook/react-native/blob/v0.87.1/packages/react-native/ReactCommon/react/nativemodule/core/ReactCommon/TurboModuleBinding.cpp) 在 Bridgeless 分支安装 nativeModuleProxy，而非 __turboModuleProxy；[TurboModuleRegistry.js](https://github.com/facebook/react-native/blob/v0.87.1/packages/react-native/Libraries/TurboModule/TurboModuleRegistry.js) 也允许从 NativeModules 取模块。因此 COS 的判断不准确，但不能直接推断模块调用必然失败：其回退路径可能通过互操作工作，iOS 事件实现也仍使用独立 emitter。不要仅改判断变量便宣称问题解决。

RN 保留互操作能力，因此旧 ViewManager 不是“必然不兼容”的证据；它同样不是 Fabric 渲染、生命周期全部通过的证明，见 [RN 0.84 说明](https://reactnative.dev/blog/2026/02/11/react-native-0.84)。

## 7. 决定路线前的最小验证

| 验证 | 通过条件 |
| --- | --- |
| RN 0.87.1 双端构建 | 修补后从锁定包安装，iOS/Android Debug 与 Release 均通过；记录解析后的原生依赖 |
| 图片推流 | 两端 24 fps 目标持续输入，服务端实际收到预期尺寸/方向；切相机、换图片、停止后行为正确 |
| 任务关联 | 同房间连续 start/change_condition，SEI 只确认对应任务；覆盖迟到事件、超时和启动中关闭 |
| 显示与 UI | 首次显示和重新挂载均不提前撤 loading；轨迹/遮罩/淡入与 iOS XLab 一致 |
| 后台 | 生成中、入房中、换源中切后台均释放本地媒体并收尾 session；回前台仅恢复预览；覆盖 JS 忙碌和 runtime 销毁 |
| COS | 临时凭据、刷新、并发进度/结果隔离、取消，以及实时 close 不误取消参考图上传 |

普通 RN 的 iOS 15.1+、Android API 26、RN 0.87.1 是验收目标；后续确定的 Expo 57.0.17/RN 0.86.3 目标要求 iOS 16.4+，详细矩阵见 engineering-baseline.md，均不能称为已验证支持。若采用厂商 RN 包，不再因参考 XmaxSDK 中的插帧符号要求 Xcode 26，也不自动引入原生 XmaxSDK 的 Compose、Kotlin 或整套 Gradle 版本；应从 RN 模板起步，按真实依赖调整。

## 8. 核对记录

此次临时证据目录为 `/private/tmp/xmax-rn-audit-rq0ch2cd`，包含原始 metadata、tgz、解压包、RN 源码片段、Codegen 工具锁文件及生成结果。目录可被系统清理；永久依据为上述固定版本发布包和源文件定位。

| 包 | tgz SHA-256 |
| --- | --- |
| RTC 1.3.2 | `ce797363e1fad88b6d7daae6dc9c22a9d50dc854374bbe978415a68d2e84fa76` |
| COS 1.3.0 | `11bb82030ffba54329b7d2cd60f477681b799467b942fe6c7e06d3ac8697aac9` |
| COS nobeacon 1.3.0 | `d3fe82ff53f4a5c98ca7c2e7cd73ed64c5a86e8f96dab8ad0de4e8b1668b44a4` |
