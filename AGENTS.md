# XmaxSDK RN 工程约定

先阅读 [工程标准](docs/engineering-baseline.md)、[架构](docs/architecture.md)、[API 契约](docs/public-api.d.ts) 和对应语义文档。当前已实现摄像头线路，实际验证和缺口见 docs/camera-implementation.md；不要把未实施、未构建或未真机验证的内容报告为已支持。

- TypeScript 承担业务，Core/Service/Media/Stream/Render/Foundation 的职责与关键名称对齐 iOS。参考目录为 /Users/xmax.ai/dev/Xmax/iOS/XmaxSDK；该目录只作参考，不是运行时、编译或发布依赖。
- 关键 API 使用 iOS 原名和返回语义。保留 currentState、sessionID、taskID、fileURL、progress、set*Listener、stopLocalCameraStream、stopLocalImageStream。不得恢复旧草案的 addListener/getState/getAudioVolumes/stopLocalStream/dispose/XmaxMediaService。
- XmaxClient 返回公开 XmaxRealtimeManaging、XmaxStorageManaging、MediaServicing，具体 Manager 实现保持内部。Swift 多参数标签映射 options 对象，异步方法映射 Promise，同步工厂与尺寸计算保留同步。
- 图片使用厂商 setDummyCaptureImagePath，本地用 RN Image 预览。不主动发送输入 SEI，保留接收任务确认。没有插帧、本地视频生成、Web、Expo Go、逐帧 JS 输出或录制入口。
- 原生仅补必要的文件、权限、后台释放和显示事件；禁止把整套 HTTP/生成业务复制到 Swift/Kotlin。厂商类型不出 Foundation，公开 API 不泄露原生对象。
- 主示例必须位于 Example/XLab，UI/交互对齐当前 iOS UIKit XLab。Expo 安装验证和 config plugin 暂缓，不创建 ExpoHost，不要求普通 RN 安装 Expo runtime。
- 关闭必须可中断进行中的操作，重复关闭幂等；过滤旧生命周期事件，回收迟到 session。实时 close 不取消独立存储任务。
- 修改依赖同时维护 lock 与安装验收；消费者不能依赖本仓库的手工 node_modules 补丁或同级目录。只有通过实际验证才扩大支持矩阵。
- 实现时检验契约、协议/尺寸 fixture 和真实生命周期竞态；媒体/后台需真机。按改动范围执行必要检查，不为纯文档调整堆砌测试。
- Git 遵循 [提交与分支约定](docs/git-workflow.md)：英文 Conventional Commits，使用 main / develop / feature/<开发者>-v<版本号>，当前开发分支为 feature/yueting-v1.0.0。
