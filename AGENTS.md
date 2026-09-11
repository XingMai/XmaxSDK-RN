# XmaxSDK RN 工程约定

先阅读 [工程标准](docs/engineering-baseline.md)、[架构](docs/architecture.md)、[API 契约](docs/public-api.d.ts) 和对应语义文档。当前已实现摄像头、图片和存储线路，实际验证和缺口见 docs/camera-implementation.md、docs/image-implementation.md 与 docs/storage-implementation.md；不要把未实施、未构建或未真机验证的内容报告为已支持。

- TypeScript 承担业务，Core/Service/Media/Stream/Render/Foundation 的职责与关键名称对齐 iOS。参考目录为 /Users/xmax.ai/dev/Xmax/iOS/XmaxSDK；该目录只作参考，不是运行时、编译或发布依赖。
- 关键 API 使用 iOS 原名和返回语义。保留 currentState、sessionID、taskID、fileURL、progress、set*Listener、stopLocalCameraStream、stopLocalImageStream。不得恢复旧草案的 addListener/getState/getAudioVolumes/stopLocalStream/dispose/XmaxMediaService。
- XmaxClient 返回公开 XmaxRealtimeManaging、XmaxStorageManaging、MediaServicing，具体 Manager 实现保持内部。Swift 多参数标签映射 options 对象，异步方法映射 Promise，同步工厂与尺寸计算保留同步。
- iOS / Android 图片均使用原生固定尺寸外部帧，不使用 dummy capture，本地均用 RN Image 预览。不主动发送输入 SEI，保留接收任务确认。没有插帧、本地视频生成、Web、Expo Go、逐帧 JS 输出或录制入口。
- iOS 原生实现使用 Swift 6，Objective-C++ 仅保留 RN Codegen / TurboModule 薄桥接。Swift 重要类型和方法使用 `///` 文档注释，遵循 Swift 格式规范。TurboModule 构造可能发生在 JS 线程；UIKit 状态必须显式异步切换主线程读取，不通过 `assumeIsolated` 假定初始化线程。
- 原生仅补必要的文件、图片帧送入、权限、后台释放和显示事件；禁止把整套 HTTP/生成业务复制到 Swift/Kotlin。厂商类型不出 Foundation，公开 API 不泄露原生对象。
- 主示例必须位于 Example/XLab，UI/交互对齐当前 iOS UIKit XLab。Expo 安装验证和 config plugin 暂缓，不创建 ExpoHost，不要求普通 RN 安装 Expo runtime。
- 关闭必须可中断进行中的操作，重复关闭幂等；过滤旧生命周期事件，回收迟到 session。实时 close 不取消独立存储任务。
- 修改依赖同时维护 lock 与安装验收；消费者不能依赖本仓库的手工 node_modules 补丁或同级目录。只有通过实际验证才扩大支持矩阵。
- 实现时检验契约、协议/尺寸 fixture 和真实生命周期竞态；媒体/后台需真机。按改动范围执行必要检查，不为纯文档调整堆砌测试。
- SDK 类的方法（含 constructor、getter/setter）之间至少留一行空行，接口方法之间同样分隔；方法内按参数校验、准备、执行、返回/清理划分逻辑段，不把所有语句连成一块，也不机械地每行加空行。
- iOS Swift 排版使用 `ios/.swift-format`；修改后执行 `npm run format:ios:check`，需要格式化时执行 `npm run format:ios`。公开声明必须有文档注释；自动检查不能替代对职责、返回语义和生命周期约束的说明。
- SDK 重要类、公开接口、方法、组件和有语义约束的属性使用 RN 官方源码常见的 `/** ... */` JSDoc 块，先解释用途，再说明默认值、返回结果、错误或生命周期边界；仅在有帮助时使用 @param/@returns/@see 等标准标签。类型已表达的信息不重复堆砌；内部注释解释原因。注释按当前实现写，不把目标能力写成已支持，不照搬 Meta 版权或 Flow 标记。
- App 层（Example/XLab）遵循同样的空行和 JSDoc 规范：组件、函数、事件处理回调之间分隔，组件内部按状态/ref、生命周期、副作用、事件处理和渲染组织逻辑段；不为排版调整 Hook 的调用顺序。重要页面、组件、Hook 和数据接口说明职责、资源所有权与业务边界，不能把仅 UI 的交互注释成已接通业务。SDK 和 App 的类方法空行、App 函数声明空行纳入 ESLint 检查。
- 日志遵循 [日志说明](docs/logging.md)：全局 business/performance 位掩码、原生 OSLog/Logcat 输出；禁止把原始响应、凭据、提示词或原生异常正文写入日志。统计回调只读取当前平台支持的属性；不恢复临时逐帧日志。
- Git 遵循 [提交与分支约定](docs/git-workflow.md)：英文 Conventional Commits，使用 main / develop / feature/<开发者>-v<版本号>，当前开发分支为 feature/yueting-v1.0.0。
