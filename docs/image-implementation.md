# 图片生成实施记录

2026-09-10。普通图片线路已实现，沿用 RN 0.87.1 新架构和既有 RTC / COS 依赖。用户负责设备运行测试，本轮不安装或操作设备。编译和逻辑测试不代表云端、帧率或最低系统已验收。

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

MediaController 管单一输入所有权，CameraController / ImageController 分别负责媒体生命周期。Foundation/Media/ImageManager 调用三个小型 TurboModule 方法读取尺寸、准备和删除图片；像素、解码对象不经过 JS，HTTP、房间、任务仍在 TS 原有层。

RTC 复用内部视频源，设置编码规格后调用 `setDummyCaptureImagePath` 和 `stopVideoCapture`，加入房间后发布主视频流。供应商声明该图片按编码帧率持续发送，RTC 本地预览不显示它，因此 XmaxVideo 对图片轨道使用 RN Image。未发送输入 SEI；新任务仍等待匹配 room/bot/task 的远端 SEI，远端显示继续等待渲染事件。

停止源前必须 disconnect。`stopLocalCameraStream` / `stopLocalImageStream` 只关闭匹配输入，重复调用幂等；本轮将原摄像头 stop 等于 close 的临时行为对齐 iOS。`close()` 仍可直接中断全部操作。图片模式调用 switchCamera 会在变更生成状态前拒绝。

- close 先取消进行中的业务，清空 dummy 图片源并销毁 RTC，再删除准备文件；原件不删除。
- 图片准备晚于 close 完成时，由创建操作回收迟到文件，不启动 RTC。操作门在准备收尾前不接受新创建。
- disconnect 取消发布并保留本地预览；重新 connect 可复用同一本地流。
- background 原生销毁 RTC，TS close 回收文件；runtime invalidate 还会回收已登记文件，迟到的原生准备不会保留新文件。前台恢复只重新准备预览，不自动发起生成。
- 独立参考图 COS 上传不归实时 Manager 所有；只在对应页面卸载或移除参考图时取消。

## XLab

首页图片卡片打开单图选择器，选择后进入共享 RealtimeScreen，保留 iOS 风格底部面板。相机入口保留薄 CameraScreen 包装。图片没有翻转按钮；连接和生成等待共用原有状态。

参考图选择现提交真实的 prompt/referencePath：预设立即使用远程路径，自定义参考图等待 COS 成功，自由模式传入其参考图或 null。普通输入图片通过 RTC 推送，本身无需 COS 上传。自定义 Renderer / 轨迹未实施，卡片和触控动图明确标记未接入。

## 构建与验收

增加 ImageIO 系统框架、原生图片辅助类和 Codegen 方法，无新增 npm 或第三方 native 版本。已更新 Podfile.lock。使用前必须重新编译安装宿主，仅 Metro 热刷新不足。

本机 iOS 首次重装 Pods 后出现 RN Debug 符号链接失败：框架保留 Release 版本，但配置标记丢失，RN 脚本误判为初始 Debug。本例 Podfile post_install 将三套预编译组件的配置标记设为 unknown，让 RN 自带脚本按下一次实际构建配置重新解包；不修改 RN 库符号、宏或二进制。

逻辑测试覆盖实际 TS Core/Media/Stream，替换原生与 HTTP 边界：图片尺寸及路径、无相机权限、匹配源停止、重复输入拒绝、图片 flip 不打断任务、参考路径信令、disconnect 保留预览、准备期间 close、迟到文件回收、RTC 启动失败、无效 fps、后台关闭与复用。全套 31 项。

本轮结果：SDK / XLab typecheck、ESLint、Prettier、公开声明正负调用和 31 项测试全部通过；iOS arm64 Debug/Release 无签名构建通过；Android assembleDebug/assembleRelease 通过。两个 Release 均包含更新后的 JS/Hermes 打包，iOS 新增原生方法经 Codegen 编译链接。临时日志为 `/private/tmp/xmax-image-{tests,android,ios-debug,ios-release}.log`。未执行真机、模拟器或实际云端请求。

待用户真机验证：EXIF 八方向/HEIC 等平台格式、超大图内存、系统相册与 Android content URI、实际 24 fps/编码尺寸、服务端 SEI 和远端首帧、停止后无发布、准备时退出、后台与 JS 忙碌时释放、连续生成及最低系统。没有扩大设备支持承诺。
