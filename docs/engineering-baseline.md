# React Native 工程标准

2026-09-10。工程目标与发布验收标准。当前已实现摄像头和存储线路的 TS 业务及必要原生适配，安装火山 RTC、腾讯 COS 和文件传输依赖；图片生成与轨迹尚未实施。iOS arm64 Debug/Release 已编译通过，真机媒体与最低系统仍未验收。每项实际结果见 [camera-implementation.md](camera-implementation.md) 和 [storage-implementation.md](storage-implementation.md)，不能把目标版本表直接当作支持承诺。

## 1. 产品与架构

- 单个 npm 包 `@xmax/react-native-sdk`（名称使用权发布前检查），仅 iOS/Android 手机端。
- TypeScript 业务，Core/Service/Media/Stream/Render/Foundation 对齐 iOS，关键公开 API/内部职责命名一致；具体契约见 public-api.d.ts。
- 基于火山 RTC RN、腾讯 COS RN，原生代码只补文件/权限、后台释放和必要的视图事件；不依赖 pod XmaxSDK 或 ai.xmax:xmax-sdk。
- 相机、图片输入、生成、内置轨迹、存储图片/视频上传下载和尺寸计算保留。图片用 setDummyCaptureImagePath；不主动发送 SEI，保留接收生成确认。
- 不支持网页、Expo Go、旧 RN 架构、插帧、本地视频生成、逐帧 JS 输出和录制。

## 2. 验收版本矩阵

| 项目 | 当前主线 |
| --- | --- |
| 示例 | Example/XLab |
| React Native / React | **0.87.1 / 19.2.3** |
| iOS / Android | **15.1+ / API 26+** |
| 架构 | 新架构、Bridgeless、配套 Hermes |
| SDK peerDependencies | React ^19.2.3；RN >=0.87.1 <0.88.0 |

RN 0.87.1 保持开发基线。Expo 暂不建工程、不提供 config plugin，也不列入首版验收；后续按同一 RN SDK 增加安装验证。先前 Expo 57/RN 0.86 组合仅为调研记录，不是当前支持承诺。

## 3. 开发和构建工具

| 项目 | 标准 |
| --- | --- |
| Node | 团队统一 **22.x，最低 22.13.0**；建工程时把具体 patch 固定到 .nvmrc 和 CI，不使用 CI 的隐式 latest |
| TypeScript | **6.0.3**；strict、noUncheckedIndexedAccess、exactOptionalPropertyTypes；公开类型不依赖 skipLibCheck 掩盖问题 |
| 包管理 | npm **11.16.0**；SDK 与 Example/XLab workspaces，共用根 package-lock.json |
| RN CLI | **20.2.0** |
| 格式/静态检查 | ESLint **9.39.1** + Prettier **2.8.8**；RN flat config，禁用不使用的 Flow-only 规则 |
| iOS 构建 | 工程起点 **Xcode 26.4+**；本机选择稳定版 **26.6** 验证，避免系统默认的 Xcode 27 beta；CocoaPods **1.17.0**，Gemfile/Gemfile.lock 固定 |
| 自有原生语言 | 按需 Swift 6 / Objective-C++、Kotlin；不强改厂商 Pod 的 Swift 设置；新增 C++ 跟随 RN |
| Android Java | **JDK 17**；自有及需修补模块 Java 字节码/语法目标 17 |
| 普通 RN Android | **AGP 9.2.1、Gradle 9.4.1、Kotlin 2.2.0、NDK 27.1.12297006** |
| 普通 RN Android SDK | **compileSdk 37 / targetSdk 36 / Build Tools 37.0.0**；targetSdk 属于 XLab，不强改宿主应用 |

普通 RN 的 Android 版本来自 [RN 0.87.1 版本表](https://github.com/facebook/react-native/blob/v0.87.1/packages/react-native/gradle/libs.versions.toml) 和 [模板 Wrapper](https://github.com/react-native-community/template/blob/0.87-stable/template/android/gradle/wrapper/gradle-wrapper.properties)。React/TS/CLI 参考 [模板 package.json](https://github.com/react-native-community/template/blob/0.87-stable/template/package.json)。工具配置是版本起点，不是已验证厂商依赖兼容。

当前 iOS deployment target 15.1；不得 post_install 把全体 Pods 降到 15.0。默认沿用宿主 RN 的链接方式，不全局强制 use_frameworks!；若要支持静态 framework 宿主需单列构建验收。无插帧依赖，Xcode 26.4+ 是工程工具链选择，不是旧 Xmax 插帧符号造成的要求。

## 4. 厂商依赖

| 包 / 组件 | 锁定的接入起点 |
| --- | --- |
| 火山 RN | `@volcengine/react-native-rtc` **1.3.2** |
| 火山 iOS | VolcEngineRTC **3.58.1.51400**，VolcApiEngine **1.6.6** |
| 火山 Android | VolcEngineRTC **3.58.1.55100**，VolcApiEngine **1.6.6** |
| 腾讯 RN | `react-native-cos-sdk-nobeacon` **1.3.0**，仅选此变体 |
| 腾讯 iOS | 专用 podspec 的 QCloudCOSXML/Slim **6.5.5** |
| 腾讯 Android | cos-android-nobeacon **5.9.52** |
| 文件传输（SDK peer） | `react-native-blob-util` **0.24.10** |
| XLab 文件选择 | `react-native-image-picker` **8.2.1** |
| XLab 视频预览 | `react-native-video` **6.19.2** |
| XLab 剪贴板 | `@react-native-clipboard/clipboard` **1.16.3** |

来源为 [已核对发布包及 SHA-256](vendor-rn-audit.md)。原生版本由 RN 包传递引入，不回退到参考 Xmax 的 3.60.106.x / COS 6.5.7，不同时安装两套 COS RN 变体。

已知阻塞修补范围：COS Android namespace；火山 Java 8 与新版语法矛盾；两包 BuildConfig 的实际启用设置；COS nobeacon 双 podspec 的选择；Bridgeless 下 COS 的模块/事件通道；火山视图解绑及首帧显示。修补前后保存来源、diff、许可证和验证结果。

SDK 不要求消费者手改 node_modules。开发期补丁可固定在 vendor-patches；正式发布必须消费包含修复的确定版本上游包或可独立安装的受维护修订包，并更新实际版本与锁文件。不要把只有本仓库根 postinstall 才生效的 patch 当成 npm 消费者支持；也不在安装脚本联网拉临时 Git 分支。上表是审核起点，发布用的修订包必须在实现后登记，当前尚不存在。

火山 iOS specs/Maven 仓库由安装文档和 Expo plugin 配置。React/RN 与厂商 RN 模块为 peerDependencies，Example 安装精确版本，自有 JS 必需库放 dependencies。避免宿主已有 RTC/COS 时装出重复 native module 或 so。禁止随意 exclude/pickFirst 掩盖不同 SDK 二进制冲突。

## 5. 当前发布包与后续扩展

当前导出 XmaxClient、摄像头实时协议、视频组件、MediaServicing 尺寸计算及 XmaxStorageManaging 图片/视频上传下载；图片生成和交互设计不提供空实现。输出 lib/module、lib/commonjs、lib/typescript，Example 从 SDK 包名导入。根包 private=true，暂不发布到 npm。发布前完成厂商修订包、许可证、干净宿主安装和真机验收。

Expo 暂不创建独立宿主或 config plugin；后续如果原生配置需要自动生成再增加。当前工程不依赖 Expo。

## 6. 质量与验收

1. **API**：公开导出与 iOS 原名映射一致；编译正/负类型调用用例，特别是 startGeneration 的两种返回值、fileURL/progress/sessionID 名称和被裁剪 API 不可调用。
2. **纯逻辑**：用 iOS 对照 fixture 验证尺寸、JSON、枚举/错误；真实状态机测试覆盖启动中 close、迟到 session/SEI、重复 close、连接失败回滚，不只测 mock 调用次数。
3. **安装**：从 npm pack 产物安装普通 RN 干净宿主；npm ci、Codegen、自动链接、iOS Debug/Release、Android Debug/R8 Release；保存依赖图、锁文件和构建记录。
4. **真机**：覆盖 RN 的 iOS 15.1、Android API 26 和各一台较新系统；缺设备标为未验收，模拟器不能替代 RTC/权限/后台真机。
5. **媒体/协议**：图片 24 fps 目标和实际尺寸、方向/黑边；相机图片互切；同房间多次生成；无输入 SEI 下正确任务确认；输入停止、麦克风和首帧显示。
6. **生命周期/存储**：真实后台、JS 忙碌、runtime 销毁、重复挂载；临时凭据刷新、进度隔离、结果/错误与清理；实时 close 不取消独立参考图上传。
7. **UI**：Example/XLab 按 xlab-ui.md 对照截图和交互，Android 同一套 RN UI；不以能调 API 代替界面对齐。
8. **发布**：arm64 真机、iOS arm64 模拟器构建、Android 模拟器 ABI 按实际厂商产物验证；检查 JNI、R8、16 KB page-size 和重复二进制；确认包名/许可证和发布产物。

仓库规范：默认不提交密钥、node_modules、生成的 Codegen/编译输出；依赖和 lock 一起变更；TS 报错使用 unknown 收窄，不用 any/ts-ignore 绕过厂商类型问题。业务错误和日志统一走 Foundation。每次增删公共 API 更新契约和映射，版本支持范围只在验收后扩大。

本机现有 Node 26.3.1 符合 RN 0.87.1 engines，本轮用于构建和测试；团队推荐的 .nvmrc 固定 22.13.0。尚未验证的机器组合不标为已通过。

Hello World 构建实测结果及 XLab 依赖声明检查例外见 [bootstrap-verification.md](bootstrap-verification.md)。当前 SDK 源码依然保留 skipLibCheck=false。

摄像头阶段 SDK 保留 skipLibCheck=false，使用 RN 官方提供的 react-native-legacy-deep-imports 类型条件，详见当前实现记录；这只选择声明文件，不关闭新架构。
