# 存储实现与验收

2026-09-10。XLab 首页存储服务卡片和页面对齐当前 iOS UIKit 实现，已接入真实系统选择器、图片/视频预览与 SDK 传输。真实云端与 iPhone 运行仍需使用有效 API Key 联调；下列本机测试不代替云端验收。

## API 与分层

公开名称沿用 iOS：`XmaxClient.createStorageManager()` 返回 `XmaxStorageManaging`，提供 `uploadImage`、`uploadImageWithSafetyCheck`、`uploadVideo`、`downloadImage`、`downloadVideo`。保留 `fileURL`、`remoteURL`、`destinationURL`、`contentType`、`progress` 及结果 `url/objectKey/etag`、`fileURL/byteCount`；仅提供文件重载。

```ts
const storage = new XmaxClient({ apiKey, environment }).createStorageManager();
const controller = new AbortController();
const file = await storage.uploadImageWithSafetyCheck({
  fileURL,
  signal: controller.signal,
  progress: p => console.log(p.fractionCompleted),
});
// 页面返回时 controller.abort()，只取消本次操作。
```

Core/XmaxStorageManager 委托 Service/StorageService；Service 复用 ApiService 获取 `GET /cos/sts` 临时凭据并按显式方法调用 `POST /cos/image/check`。Foundation/StorageManager 封装腾讯 COS 与原生文件下载，不将厂商对象暴露给宿主。

每次上传使用自己的 STS 凭据与回调组，不缓存长期密钥；沿用当前 iOS 的签名时间策略，开始时间向前容忍 60 秒、有效窗口 25 分钟。传输总超时 15 分钟。普通图片上传不调用安全检测；安全检测返回 unsafe 时抛 `UNSAFE_IMAGE`，成功返回检测后的 URL。

图片、视频和参考图统一使用 COS 简单 PUT，不自动分片、不续传。具体双端适配和验证边界见本文末节。简单上传适用 COS 自身的对象大小限制；超出限制时不回退分片。

上传要求可读 `file://`，XLab 将系统选择器的 file/content URI 复制到自己的缓存。媒体字节不进入 JS Base64。下载不请求上传凭据，直接使用远程 URL，写入目的地同目录的唯一临时文件，完整成功后原子替换已有目的文件；这与当前 iOS `Data.write(.atomic)` 对齐，修正最初草案的“不覆盖”描述。

可选 `signal: AbortSignal` 是 Swift 调用方 Task 取消的语言适配，不增加 Manager 的 cancel/dispose 方法。页面返回取消当前传输，迟到进度不再更新 UI，最终删除本页缓存与未完成下载的临时文件。摄像头 close 不影响独立存储任务。上传不承诺进程退出后续传。

## XLab

首页增加 SDK FEATURES 与橙色存储卡片；存储页包含顶部栏、介绍卡片、STEP 01 文件选择、尺寸/大小、进度、错误，以及 STEP 02 耗时、结果 URL 和复制按钮。图片提供“安全检测上传”和“普通上传”，视频仅提供视频上传。视频本地静音循环预览，进入后台暂停；系统选择器取消后保留原选择。首页 API Key 与环境传入存储页，Key 仅保存在内存。

本页没有额外增加下载界面，与 iOS 当前上传演示范围一致；下载能力通过公开 SDK 方法提供。图片文件上传不等于图片 RTC 生成线路，后者仍未实施。

## 依赖与构建

- 腾讯 `react-native-cos-sdk-nobeacon@1.3.0`，iOS QCloudCOSXML/Slim 与 QCloudCore/WithoutMTA 6.5.5，Android cos-android-nobeacon 5.9.52。
- SDK 文件操作 `react-native-blob-util@0.24.10`。
- XLab image-picker 8.2.1、react-native-video 6.19.2、clipboard 1.16.3。XLab 的选择、预览和复制依赖不成为 SDK peer。
- `vendor-patches` 登记 COS 构建、声明、HTTPS 和回调清理修补，以及 BlobUtil 缺失声明与原子文件替换修补；根 prepare 可重复执行。nobeacon 专用 podspec 在 XLab 自动链接配置中显式选择。

依赖安装与 Pod lock 已更新。新增原生依赖后需重新编译 App；iPhone 在 `Example/XLab/ios/XLab.xcworkspace` 选择自己的 Team 与设备后 Run，复用已有 Metro 8081。不能只依靠 Fast Refresh 更新旧二进制。当前包仍 private，外部干净宿主安装与厂商修订包发布条件没有放宽。

## 已验证与边界

- TypeScript 严格检查、ESLint、Prettier、公开声明调用及 22 项测试通过；包含原有 15 项摄像头测试和 7 项存储测试。存储覆盖凭据协议、文件/URL 校验、安全检查、取消后迟到结果、进度隔离和厂商回调清理。
- RN 0.87.1 新架构下，Android Debug/Release 与 iOS arm64 无签名 Debug/Release 构建通过。iOS 使用稳定 Xcode；未改动用户的签名 Team。
- Android API 37 模拟器实际执行 COS 原生上传：本机 HTTP fixture 返回虚拟 STS，验证带签名 PUT、上传进度/成功回调、安全检测请求，以及下载覆盖旧文件后的字节一致性。这验证原生桥接与传输，不验证腾讯云鉴权、权限或线上安全检测策略。
- Android UI 截图与交互记录见 `Example/XLab/ui-baselines/README.md`。
- 未验证有效 API Key 的真实云端上传、iPhone 运行、最低系统、后台长时间传输和外部 npm tarball 宿主。iOS COS 事件通道仍需真机检查；编译成功不能代替运行验证。

## iOS 参考

读取当前工作区 `/Users/xmax.ai/dev/Xmax/iOS/XmaxSDK`，HEAD `b112758310a34d499dc9a764fdb4c37de2938b17`；工作区可能有未提交变化，不将其视为纯净发布快照。文件 SHA-256：

| 文件 | SHA-256 |
| --- | --- |
| `Examples/XLab/XLab/Modules/XLStorage/StorageViewController.swift` | `42164b83187f6c0ed6b27965afcad495e788a886ba3c00e617d659678cf991d1` |
| `Sources/XmaxSDK/Service/Storage/StorageService.swift` | `f1352d9f73c4f490d0d90addeddf7ef14538fe8c7484938162b8b1cac789f65b` |
| `Sources/XmaxSDK/Foundation/Storage/StorageManager.swift` | `6f8332974cd83c6e277fa42988811aa68b68803fab31d91e640ea771c3c2a351` |

图标直接取自 iOS 资源，来源见 `Example/XLab/src/assets/storage/README.md`。构建与运行不依赖同级 iOS 仓库。

## 关闭自动分片（2026-09-10）

按用户要求统一普通上传。此前 Foundation 注册 COS TransferManager 时没有传输策略，iOS QCloudCOSXML 6.5.5 的 `QCloudCOSXMLUploadObjectRequest` 对文件 URL 默认使用 1 MiB 阈值，超过后进入 multipart。这与参考 iOS XmaxSDK 直接使用 `QCloudPutObjectRequest` 的行为不同；没有本次设备的错误码，不能据此确认自动分片就是上传失败的唯一原因。

- Android：通过 RN 现有 `forceSimpleUpload: true` 映射到 `TransferConfig.Builder.setForceSimpleUpload(true)`。
- iOS：当前 RN bridge 忽略 `forceSimpleUpload`，使用已支持的 `divisionForUpload: Number.MAX_SAFE_INTEGER` 设置 64 位 `mutilThreshold`。已核对已安装 SDK 的 `fakeStart` 分支：所有支持大小的文件进入 `startSimpleUpload`，内部创建普通 `QCloudPutObjectRequest`。不把这一数值发送给 Android 的 32 位 `getInt`。
- 传输池使用独立的 `xmax:simple:` key，避免复用旧自动分片配置；所有调用共用这一规则，不传 uploadId 或注册分片初始化回调。保留文件 URL 传输、每次 STS、进度隔离及取消。
- 失败现在保留有效 HTTP 状态、COS 服务错误码与数字客户端错误码，例如 `COS upload failed (HTTP 403, AccessDenied)`。不复制原始错误正文、鉴权参数或完整签名 URL。
- 未修改厂商文件或原生代码；已有安装的原生 bridge 已具备所需配置，开发包可通过 Metro 刷新更新策略。发行包需重新打包 JS。

SDK / XLab 类型检查、ESLint、Prettier、SDK 构建及当前工作区 66 项测试通过。新增 3 项传输测试执行真实 Foundation 和厂商 JS 回调管理，仅替换原生边界，覆盖双端普通上传策略、图片/视频/参考图、错误码、并发进度和取消时迟到原生任务的清理。本轮没有实际云端上传、HTTP 抓包或真机验收，不将配置和逻辑检查报告为用户图片已经上传成功。
