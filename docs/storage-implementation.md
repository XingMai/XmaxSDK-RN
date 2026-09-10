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
