# React Native 公开 API 标准

2026-09-09。已确定的首版设计标准。当前已实现摄像头实时 API、组件和尺寸计算；图片/存储/交互仍是后续设计。完整目标声明见 [public-api.d.ts](public-api.d.ts)，当前可调用范围见 [camera-implementation.md](camera-implementation.md) 和 src/index.ts 导出，本文解释目标语义。关键名称、参数业务名、状态原始值及职责对齐当前 iOS 源码。

最初设计参考 iOS 工作区 `/Users/xmax.ai/dev/Xmax/iOS/XmaxSDK`，HEAD 为 `961fbb37472f9a59f85502ebcacb74d6f5e66caa`，包含未提交修改，不能把本次参考描述为该 commit 的纯净发布版本；文件指纹见 [ios-reference.json](ios-reference.json)。摄像头实施采用更新后的工作区快照，见 [camera-ios-reference.json](camera-ios-reference.json)。

## 1. 命名与语言适配

| iOS 公开入口 | RN 标准 |
| --- | --- |
| `XmaxClient(configuration:)` | `new XmaxClient(configuration)`，同步创建，无新增 `create` 工厂 |
| `createRealtimeManager(options:)` → `XmaxRealtimeManaging` | 同名方法，返回同名 interface；`XmaxRealtimeManager` 为内部实现 |
| `createStorageManager()` → `XmaxStorageManaging` | 同名方法及 interface；配置无效同步抛 XmaxError |
| `createMediaService(model:)` → `MediaServicing` | 同名方法及 interface；内部类叫 `MediaService` |
| `currentState`、`localAudioVolume`、`remoteAudioVolume` | 同名只读属性；TS 读取最新已处理状态，不增加 getState/getAudioVolumes |
| `setStateListener` 等五种监听方法 | 同名方法、单监听器替换语义，传 null 清除 |
| `stopLocalCameraStream` / `stopLocalImageStream` | 分别保留；不公开合并后的 stopLocalStream |
| `XmaxVideo` / `XmaxRealtimeVideo` | 同名 React 组件，属性名沿用 iOS SwiftUI 组件 |
| `RealtimeState.sessionID` / `taskID` | 大写 ID 保留，不改成 sessionId/taskId |
| `XmaxDownloadedFile.fileURL` | 保留 fileURL，不改成 uri |
| `XmaxStorageProgressHandler` / 参数 `progress` | 保留名称，不改成 onProgress |

Swift 带多个参数标签的方法转成同名 TS 方法的 options 对象，字段使用原业务名。单一无标签值如 listener、volume、size 直接传参。URL 转为 string；nil 转为 null；Swift async 转为 Promise；同步构造/纯计算保留同步。Swift actor 的异步属性访问转为 TS 只读状态快照。这些是语言差异，不是业务 API 改名。

Swift struct 以 readonly interface 表达，规范化/校验放在接收该值的方法；不要求为每个配置对象创建 JS class。枚举成员和 rawValue 均对齐，例如 `RealtimeConnectionState.generating === 'Generating'`，`XmaxErrorSeverity.fatal === 'FATAL'`，`RealtimeModel.x2_0 === 'x2.0'`。日志 OptionSet 映射为数字位掩码，默认 0。

## 2. Client 与服务

Client 只保存配置并创建 TS 服务，不启动 RTC、不申请权限、不发请求。apiKey 去除首尾空白；本地预览允许空 key，创建存储 Manager 和连接服务端时校验。默认 environment 为 china；日志默认关闭。Client 配置不可变，切换环境/凭据创建新 Client。

业务日志按 Client 过滤，厂商全局日志不承诺实例隔离。SDK 日志不得输出 API Key、临时密钥或完整鉴权头。

与 iOS 一致，Client 不额外提供 dispose，实时 Manager 用 close 收尾；MediaService 不占原生资源。消费者持有自己创建的 Manager，页面卸载时 close 并清除监听器。共享 Client 的页面不能关闭其他页面的 Manager。内部注册表不得永久强引用已关闭且不再使用的对象。

## 3. 实时操作

| 调用 | 行为 / 返回值 |
| --- | --- |
| `createLocalCameraStream({videoFormat?, position?, useMicrophone?})` | 开始本地相机预览，返回本地流；默认 front、false、模型默认规格 |
| `createLocalImageStream({fileURL, videoFormat?})` | 文件准备、规格解析和图片预览就绪后返回本地流；图片由 dummy capture 持续推流 |
| `stopLocalCameraStream()` / `stopLocalImageStream()` | 已断开时停止匹配类型的本地输入；没有对应类型时无操作；在线时先 disconnect |
| `connect({localStream})` | 创建 session、入房、发布输入，返回远端流；不自动开始生成 |
| `startGeneration({localStream, context?})` | 按需连接，开始/更新生成，返回远端流 |
| `startGeneration({context?})` / `startGeneration()` | 要求已连接，开始/更新生成，返回 Promise<void> |
| `switchCamera()` | 返回复用原 videoTrack 的本地流；生成中停止旧任务、切换、使用缓存条件恢复，连接保留 |
| `disconnect()` | 关闭生成、房间、session，保留本地输入与预览；麦克风停止采集 |
| `close()` | 关闭连接并释放全部本地媒体、RTC 和绑定；幂等、可复用，保留业务监听器 |

首次生成必须有 context；之后 null 或省略表示复用缓存。传入新 context 时完整替换，referencePath 空白、null 或省略表示清除参考图。prompt/referencePath 按 iOS 去除首尾空白。

本地源一次只允许一个；创建新源之前断开并停止旧源。不隐式覆盖。创建相机时检查/请求相机权限，useMicrophone=true 时同时请求麦克风权限；麦克风连接时采集、断开时停止。本地预览音量与远端音量范围 0…1，初值及预置应用时机按 iOS；图片没有音轨时保存音量设置但不制造音频。

模型 x2_0 的默认相机规格为 832×1472@24；图片默认按 MediaService 输入规则计算，24 fps。显式规格 width/height 必须为正偶数、fps 为正整数。尺寸计算沿用 iOS 的 600000…1280000 像素、32 对齐、越界候选选择和舍入规则，建立两端共用输入/期望结果样例。

RealtimeVideoTrack 保持稳定对象身份，videoFormat/position 是动态只读 getter；switchCamera 更新同一轨道元数据。React 显示层通过内部订阅更新，不能仅依赖对象引用变化触发重绘。流只能由对应 Manager 创建，不允许结构相同的对象冒充；内部记录 owner、来源和生命周期版本，不新增公开 kind 字段。

首版不发送输入 SEI，但保留远端 SEI 任务确认。新任务的 startGeneration 不以消息发送成功或任意远端首帧作为完成条件。已有任务更新 context 使用同一 taskID 的 change_condition，按当前 iOS 语义发送成功即返回，不等待一条新的 SEI。无输入 SEI 时服务端仍能回传对应任务确认是联调准入条件，不能在未确认前静默放宽成功语义。

## 4. 监听和错误

保留 `setStateListener`、`setErrorListener`、`setCameraPreviewReadyListener`、`setNetworkQualityListener`、`setPerformanceAlarmListener`。每类一个回调，新回调替换旧回调，null 清除；不提供额外 addListener 或订阅句柄。setter 返回 Promise<void>，完成后旧监听器不再接收新事件。

setStateListener 注册时交付 currentState，再交付有序状态变化；在回调前更新 currentState。相机预览就绪回调无参数，表示采集画面可用于预览，不代表屏幕已呈现，不用它确认图片输入。性能告警只报告，不自动修改视频规格。

异步失败 reject XmaxError，同步验证/计算失败 throw XmaxError。错误 code、severity、apiCode、httpStatus 命名及原始值与 iOS 一致，默认 severity 映射也一致。只有导致实时流程终止的错误触发 setErrorListener；避免 Promise reject 与回调重复 toast。正常取消为 CANCELLED。原生模块缺失归为 INTERNAL_ERROR 并说明安装/构建原因，不额外发明首版错误码。

## 5. React 视频组件

目标交互属性尚未在摄像头阶段导出。XmaxVideo 使用 track；XmaxRealtimeVideo 使用 localTrack/remoteTrack。两者都有 videoContentMode（默认 fill）、isInteractionEnabled（默认 true）及 RN ViewProps/style。对应 iOS SwiftUI 名称，不额外导出 UIKit 的 XmaxVideoView/XmaxRealtimeVideoView 别名。

内部用厂商 NativeViewComponent 渲染 RTC、RN Image 显示图片本地预览；控制层负责绑定及内置轨迹。无轨道时黑底；远端层确实可显示后 0.3 秒淡入，解绑恢复本地预览。不能把 NativeViewComponent.onLoad 当首帧，也不能用同一房间历史 decoded 首帧确认新绑定。

同一组件的两条轨道必须属于同一 Manager，关闭后立即解绑；组件卸载只解绑，不自动关闭 Manager。轨迹要按内容缩放、黑边、旋转/镜像转换坐标，沿用 iOS tracks 信令。媒体像素不经过 JS，手势/路径可以在 RN 中处理；需要高频优化时限定在交互实现内，不改变公开 API。

## 6. 存储与文件

uploadImage、uploadImageWithSafetyCheck、uploadVideo、downloadImage、downloadVideo 均保留。首版只支持文件 URL 重载，Data/UIImage 重载不提供；fileURL 字段不更名。下载参数使用 iOS 本地变量名 remoteURL/destinationURL，进度字段名 progress。

文件 URL 在 RN 中为字符串：iOS 可读 file://；Android 可读 file:// 或已授权 content://。源文件转成 RTC 所需绝对路径由 Foundation/File 处理。ph://、assets-library://、data:、网络输入图、require() 数字资源不直接接受。下载目的地为应用可写 file://，冲突拒绝，不覆盖现有文件；临时文件只删除 SDK 自己创建的。

XmaxStorageProgressHandler 接收 RN 的 StorageProgress，字段按 Foundation.Progress 的 completedUnitCount/totalUnitCount/fractionCompleted 表达；未知总量为 null。各传输操作独立路由，结束后清理进度、凭据等待和暂存资源，不串回调。安全检查保持显式方法，不默认为所有图片上传执行。

存储使用临时凭据；不让宿主配置长期 SecretKey。实时 close 不取消共享存储任务，尤其不能取消 XLab 的参考图上传。首版不新增传输暂停/取消/dispose API。MediaServicing.resolveModelInputSize 是同步纯计算，不返回 Promise。

## 7. 生命周期

close/disconnect 立即取消相关未完成操作，不能排在等待生成确认的任务后面。重复 close 等同一清理任务；旧结果按生命周期版本丢弃，迟到创建的 session 仍需回收。失败收尾尽量完成所有本地释放，不能因 DELETE 失败跳过退房。

真正进入后台时 close；临时 inactive、权限弹窗、选择器或 Activity 配置重建不当成永久关闭。回前台 XLab 自动恢复本地预览，生成需用户再次触发。AppState 负责正常协调，原生生命周期兜底负责 JS 挂起/runtime 销毁时停止媒体；服务端心跳超时负责网络不可达/进程被杀时回收会话。

## 8. 明确不实现的 iOS 能力

| 能力 | 首版处理 |
| --- | --- |
| createLocalVideoStream / stopLocalVideoStream | 不导出；存储的视频文件上传下载保留 |
| isFrameInterpolationEnabled / setFrameInterpolationEnabled / resolveFrameInterpolationSize / supportsFrameInterpolation | 不导出、不引入插帧实现 |
| setRemoteVideoFrameListener / RealtimeVideoFrameListener | 不向 JS 输出逐帧像素；首版无录制能力 |
| UIImage / Data 输入重载、自定义 TrajectoryEffectRendering | 不导出，文件输入与内置交互保留 |
| UIKit/SwiftUI 系统协议方法、Swift struct init/validate | 使用 TS 构造、接口和入口校验适配，不仿造 Swift 运行时 |

未实现能力只裁剪，不以新名称替代。若之后支持，恢复 iOS 原名。

## 9. 接入示例

```tsx
import {
  XmaxClient, XmaxRealtimeVideo, RealtimeModel, CameraPosition,
  RealtimeConnectionState,
} from '@xmax/react-native-sdk';

const client = new XmaxClient({ apiKey });
const realtime = client.createRealtimeManager({ model: RealtimeModel.x2_0 });
await realtime.setStateListener(state => {
  if (state.connectionState === RealtimeConnectionState.disconnected ||
      state.connectionState === RealtimeConnectionState.error) {
    setRemoteTrack(null);
  }
});
const localStream = await realtime.createLocalCameraStream({ position: CameraPosition.front });
setLocalTrack(localStream.videoTrack);
const remoteStream = await realtime.connect({ localStream });
setRemoteTrack(remoteStream.videoTrack); // 提前挂载远端视图，接收本次真实 rendered 首帧
await realtime.startGeneration({ context: { prompt: '油画风格' } });
await realtime.startGeneration({ context: { prompt: '水彩风格' } }); // void
// <XmaxRealtimeVideo localTrack={localTrack} remoteTrack={remoteTrack} style={{flex: 1}} />
await realtime.disconnect(); // 保留预览
await realtime.setStateListener(null);
await realtime.close();
```

片段不是 React effect 的完整实现。XLab 必须补 try/finally、启动取消、其余监听器清除与轨道 state 清理；Client/Manager 不能在每次 render 时重建。
