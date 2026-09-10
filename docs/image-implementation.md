# 图片生成实施记录

2026-09-10。普通图片线路已实现，沿用 RN 0.87.1 新架构和既有 RTC / COS 依赖。用户负责设备运行测试，本轮不安装或操作设备。编译和逻辑测试不代表云端、帧率或最低系统已验收。

## 当前 Android 裁切修复

Android 改用原生 `pushExternalVideoFrame` 重复提交准备图片，绕过下面日志中已发现方向不一致的 dummy 源。原生只解码一次，保留完整宽高，构建 RGBA 帧，rotation 固定为 0，按配置帧率使用单调时间戳送入；TS 仅传一次路径和格式，不逐帧传输像素，不发送输入 SEI。本地预览及公开 createLocalImageStream API 不变。RN iOS 仍使用原来的 dummy 源和方向配置，未扩大其实际验收范围。

新增内部 TurboModule startImageVideo / stopImageVideo。Android 原生通过受 owner 租约保护的适配类取得已由 RN adapter 创建的 RTC 单例；依赖锁定为 3.58.1.55100 的 protected mInstance，已核对 vendor createRTCEngine 使用同一单例，升级厂商 SDK 时须复核此处。没有创建第二个引擎或使用反射。重复帧只共享不可变像素存储，frame.release 归还单帧包装；关闭、后台、runtime invalidate 先停定时器并使迟到解码失效，再销毁引擎。启动失败拒绝 Promise，运行中送帧失败停止定时器并记录原生日志。

需要重新编译安装 App，Metro 重载不能为旧二进制添加内部模块方法。复测时应同时观察 Native image frames started、Local video encoded dimensions 和后台原视频完整性；不能仅凭最后的宽高相等视为已完成云端验收。

验证：TypeScript、ESLint、Prettier、SDK 构建和 51 项测试通过；Android Debug / Release、iOS 真机目标 Debug / Release 无签名编译均通过。Android 关闭 Kotlin 增量编译后完成原生校验，排除了 workspace 符号链接引起的旧增量缓存冲突。未安装设备或触发生成；完整图片的最终云端呈现仍由用户验收。

## 问题定位记录（旧 dummy 路线）

已撤回图片线路的 setVideoCaptureConfig：该接口用于内部采集，不能据此推断可控制静态图片处理。图片线路只保留先前用于固定方向的 setVideoOrientation。通过 adb 提取的本次准备 JPEG 为完整 736 × 1664 图片；用户确认后台实际接收帧已是面部局部裁切，播放器不再作为本次排查前提。

进一步读取 Android 3.58.1.55100 原生日志，在 17:14 两次推流中都发现编码输入与输出方向不一致：

```text
17:14:18.369 rx_video_encode_node.cc:2100
  create encoder ... width*height: 736*1664
17:14:18.422 rx_video_encode_pipeline_controller.cc:1394
  image resolution from: 0*0 -> 1664*736
  cfg_target_enc_width,height:736*1664
17:14:28.361 rx_video_encode_pipeline_controller.cc:1394
  image resolution from: 0*0 -> 1664*736
  cfg_target_enc_width,height:736*1664
```

这些原生记录确认，实际进入编码管线的是横向帧，最终竖向编码尺寸不能证明图片源内容完整。结合完整缓存图片和后台裁切帧，问题集中在 dummy 图片源到编码器的内部几何处理。RN 的 setDummyCaptureImagePath 桥接及 Android RTCVideoImpl 均直接传递路径，图片解码/缩放在闭源 C++ 中，当前无法仅凭这些日志确认第一次内容裁切的具体函数。不要再通过 UI fit/fill 或未经验证的采集参数补偿；最终修复需验证编码输入帧与完整图片的一致性。

用户后续提供的后台“原视频”截图呈横向，说明只核对请求与远端帧尺寸不足以定位发送端问题。RN 图片线路此前未设置 RTC 视频帧方向。现于图片编码配置、dummy 图片启用和进房前，按准备尺寸设置 `setVideoOrientation(PORTRAIT / LANDSCAPE)`，方图固定 Portrait，避免依赖相机自适应方向。此设置仅用于内部 dummy 图片源，摄像头线路不改动；依据 [火山 RN API 的方向设置与静态图片说明](https://www.volcengine.com/docs/6348/1390575?lang=zh)。该修改针对已识别的方向配置缺口，是否解释并解决后台视频异常仍需设备复测。

新增 `Local video encoded dimensions` 日志，读取 onLocalStreamStats 的 encodedFrameWidth / encodedFrameHeight，仅在主流有效尺寸首次出现或变化时打印；它表示实际发送的编码尺寸，与 `Video encoder configured` 的期望配置区分。复测 736 × 1664 竖图时，确认该日志和后台原视频均保持竖向。新增方向选择、进房后禁止切换、上行尺寸去重/屏幕流过滤回归测试，TypeScript 构建与静态检查通过；未把回归测试视为真实编码器或服务器验收。

XLab Debug 开启 `XmaxLoggerOption.all`，Release 仍关闭。Metro 终端按 `j` 打开 React Native DevTools，在 Console 过滤 `XmaxSDK`，勾选 Preserve log，重载并重新选择图片、开始生成。查看 `Image input dimensions`（原图与准备目标）、`Video encoder configured`、`Generation signal dimensions`、`Remote frame decoded` / `Remote frame rendered` / `Remote video size changed`（实际帧宽高与旋转）。过滤 `XLab` 可查看 `Realtime viewport` 的布局尺寸和 fit/fill 模式。旋转读取不受厂商桥接支持时记为 null，不影响原有帧事件。

日志不包含 Key、图片路径、提示词或房间凭证。远端 track 的 videoFormat 初始化自输入格式，不能当作实际接收帧尺寸；诊断应看 RTC 帧回调。布局尺寸单位为 RN 逻辑点，帧尺寸单位为像素，对比宽高比时需考虑旋转。当前“本地预览正常、远端比例不对”的原因仍待复现日志确认；未改动尺寸算法或渲染缩放模式。

本次仅修改 TypeScript 日志，已通过类型、Lint、格式检查、SDK 构建和 46 项测试；未触发设备生成。

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

Android 选择 external 视频源并设置编码规格后，启动原生固定尺寸图片帧；iOS 设置编码规格后调用 `setDummyCaptureImagePath` 和 `stopVideoCapture`。随后加入房间发布主视频流。XmaxVideo 对图片轨道统一使用 RN Image。未发送输入 SEI；新任务仍等待匹配 room/bot/task 的远端 SEI，远端显示继续等待渲染事件。

停止源前必须 disconnect。`stopLocalCameraStream` / `stopLocalImageStream` 只关闭匹配输入，重复调用幂等；本轮将原摄像头 stop 等于 close 的临时行为对齐 iOS。`close()` 仍可直接中断全部操作。图片模式调用 switchCamera 会在变更生成状态前拒绝。

- close 先取消进行中的业务，Android 停止原生图片帧、iOS 清空 dummy 图片源，然后销毁 RTC，再删除准备文件；原件不删除。
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
