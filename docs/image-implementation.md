# 图片生成实施记录

2026-09-10。普通图片线路已实现，沿用 RN 0.87.1 新架构和既有 RTC / COS 依赖。用户已在 Android 模拟器确认裁切修复后的图片内容正常；真机、实际帧率与最低系统仍需验收。

## 图片帧输入

iOS / Android 均使用原生 `pushExternalVideoFrame` 重复提交准备图片，不使用 dummy capture 或内部采集的方向设置。公开 API 和本地 RN Image 预览不变。

双端原生只解码一次，Android 共享不可变 RGBA 像素，iOS 共享 BGRA CVPixelBuffer，保留准备后的宽高，rotation 固定为 0。首帧立即提交，之后按 `RealtimeVideoFormat.fps` 使用固定延迟调度，每次提交完成后等待 `1 / fps` 秒，时间戳取单调时钟；实际帧率受提交耗时与线程调度影响。TS 仅传一次路径和格式，不逐帧传输像素，不发送输入 SEI。

内部 TurboModule `startImageVideo` / `stopImageVideo` 通过 owner 租约管理帧源。Android 适配类访问已由 RN adapter 创建的 RTC 单例，依赖锁定版本 3.58.1.55100 的 protected `mInstance`；升级厂商 SDK 时须复核此处。iOS 在 RN 已创建引擎且 owner 有效时，通过厂商文档约定的重复 `createRTCVideo` 调用取得同一单例，原生后台与释放共用 runtime 锁。没有创建第二个引擎或使用反射。Android 通过 `frame.release` 归还单帧包装，iOS 通过 ARC 管理帧对象并向 SDK 提交 CVPixelBuffer；共享像素在帧源和 SDK 完成使用后释放。关闭、后台和 runtime invalidate 先停止定时器并使迟到解码失效，再销毁引擎。文件解码、规格校验或引擎不可用仍拒绝 Promise；`pushExternalVideoFrame` 返回非零不阻塞图片流创建，也不停止定时器，后续按配置帧率继续提交。该行为仅表示帧源已启动，不保证每次送帧均被 SDK 接收。

## 对齐与调用

参考当前 iOS `Media/Image/ImageController.swift`、`ImageSourceController.swift`、`Foundation/Media/Image/DecodedImage.swift`、`Core/Realtime/XmaxRealtimeManager.swift`。关键公开名称为 `createLocalImageStream({fileURL, videoFormat?})` 和 `stopLocalImageStream()`。

```ts
const manager = client.createRealtimeManager({ model: RealtimeModel.x2_0 });
const local = await manager.createLocalImageStream({ fileURL });
// Render local.videoTrack with XmaxVideo or XmaxRealtimeVideo.
const remote = await manager.connect({ localStream: local });
// Mount remote.videoTrack before waiting for generation confirmation.
await manager.startGeneration({ context: { prompt: '让画面自然动起来' } });
await manager.disconnect(); // Keeps the prepared local image available.
await manager.stopLocalImageStream();
await manager.close(); // Also usable directly to interrupt pending work.
```

- SDK 接受本地 file URL、绝对路径，以及 Android 可读取的 content URI。不接受网络输入 URL；调用方保留原件直到准备完成。XLab 保留选择器返回的源 URI，供后台回来重新准备。
- 缺省规格按方向校正后的源尺寸解析，24 fps；显式规格仍先经 MediaService 模型尺寸解析，保留请求 fps。最终尺寸按 iOS x2.0 的 32 对齐及 600000…1280000 像素规则计算。
- 原生 ImageIO / Bitmap + EXIF 处理方向和反射，居中裁剪到最终尺寸，写入 SDK 私有缓存 JPEG（质量 0.95，透明区域黑底）。解码长边限制为 4096，以控制内存；超大图可能先降采样。动画图片只取静态首帧，具体格式由系统解码器支持。
- 推流与 RN Image 预览共用准备后的文件，因此 SDK 尺寸、内容比例与实际输入一致。SDK 默认显示模式仍为 fill，XLab 图片页面选择 fit。
- 图片不请求相机/麦克风权限，不启动相机/音频采集；图片创建将远端播放音量设为 1，相机创建仍静音。

## 分层与释放

iOS 的图片文件处理、CVPixelBuffer 推帧及权限/owner/后台释放均使用 Swift 6。`XmaxRuntime.mm` 只转发 TurboModule 方法，Codegen C++ 头文件为私有头，不进入 Swift 模块。帧源与 Runtime 共用递归锁，图片缓存另有独立锁；像素和定时器由 Swift ARC 管理。

MediaController 管单一输入所有权，CameraController / ImageController 分别负责媒体生命周期。Foundation/Media/ImageManager 调用三个小型 TurboModule 方法读取尺寸、准备和删除图片；像素、解码对象不经过 JS，HTTP、房间、任务仍在 TS 原有层。

双端选择 external 视频源并设置编码规格后，启动原生固定尺寸图片帧。随后加入房间发布主视频流。XmaxVideo 对图片轨道统一使用 RN Image。未发送输入 SEI；新任务仍等待匹配 room/bot/task 的远端 SEI，远端显示继续等待渲染事件。

停止源前必须 disconnect。`stopLocalCameraStream` / `stopLocalImageStream` 只关闭匹配输入，重复调用幂等；匹配源的停止语义对齐 iOS。`close()` 仍可直接中断全部操作。图片模式调用 switchCamera 会在变更生成状态前拒绝。

- close 先取消进行中的业务，双端停止原生图片帧，然后销毁 RTC，再删除准备文件；原件不删除。
- 图片准备晚于 close 完成时，由创建操作回收迟到文件，不启动 RTC。操作门在准备收尾前不接受新创建。
- disconnect 取消发布并保留本地预览；重新 connect 可复用同一本地流。
- background 原生销毁 RTC，TS close 回收文件；runtime invalidate 还会回收已登记文件，迟到的原生准备不会保留新文件。前台恢复只重新准备预览，不自动发起生成。
- 独立参考图 COS 上传不归实时 Manager 所有；只在对应页面卸载或移除参考图时取消。

## XLab

首页图片卡片打开单图选择器，选择后进入共享 RealtimeScreen，保留 iOS 风格底部面板。相机入口保留薄 CameraScreen 包装。图片没有翻转按钮；连接和生成等待共用原有状态。

参考图选择现提交真实的 prompt/referencePath：预设立即使用远程路径，自定义参考图等待 COS 成功，自由模式传入其参考图或 null。普通输入图片通过 RTC 推送，本身无需 COS 上传。自定义 Renderer / 轨迹未实施，卡片和触控动图明确标记未接入。

## 构建与验收

Swift 迁移已通过 Xcode 27 的 arm64 Debug、基线 Xcode 26.6 的 arm64 Release 无签名整包编译，以及 51 项现有逻辑测试和 Swift 格式检查。原生运行、图片内容与后台释放由用户设备验收；迁移保持非阻塞推帧语义，不把返回成功等同于 RTC 接收了每一帧。

增加 ImageIO 系统框架、原生图片辅助类和 Codegen 方法，无新增 npm 或第三方 native 版本。已更新 Podfile.lock。使用前必须重新编译安装宿主，仅 Metro 热刷新不足。

逻辑测试覆盖实际 TS Core/Media/Stream，替换原生与 HTTP 边界：图片尺寸及路径、无相机权限、匹配源停止、重复输入拒绝、图片 flip 不打断任务、参考路径信令、disconnect 保留预览、准备期间 close、迟到文件回收、RTC 启动失败、无效 fps、后台关闭与复用，以及双端外部源、配置帧率传递和先停帧再销毁引擎。

双端原生图片帧实现已通过 SDK / XLab typecheck、ESLint、Prettier、SDK 构建及 51 项测试；iOS arm64 Debug/Release 无签名构建和 Android Debug/Release 构建均通过。Android 图片内容已由用户在模拟器确认正常；本次 iOS 外部帧实现仅完成编译与逻辑验证，尚未运行设备或触发云端生成，该结果不替代以下真机验收。

待用户真机验证：EXIF 八方向/HEIC 等平台格式、超大图内存、系统相册与 Android content URI、实际 24 fps/编码尺寸、服务端 SEI 和远端首帧、停止后无发布、准备时退出、后台与 JS 忙碌时释放、连续生成及最低系统。没有扩大设备支持承诺。
