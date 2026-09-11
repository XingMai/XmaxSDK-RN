# XmaxSDK React Native 开发与验证

从仓库根目录运行以下命令。SDK 接入概览见 [README](../README.md)。

## 安装与运行

在仓库根目录执行：

```sh
npm ci
bundle install
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer npm run pods
npm start
```

Node 推荐 `.nvmrc` 的 22.13.0；本机验证使用 26.3.1。Android 使用 JDK 17，并配置 `ANDROID_HOME`；详细版本见 [工程标准](engineering-baseline.md)。`npm ci` 的 prepare 会自动应用已登记的开发期 RTC、COS 和文件传输补丁。

新增原生模块后必须重新编译安装，Metro 热更新不能为旧二进制增加 RTC、COS、文件选择或视频预览模块。保持 Metro 终端运行，在另一终端启动 App：

```sh
# iPhone 真机：也可在 Xcode 打开工作区，配置自己的签名 Team，选择手机后 Run
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer npm run ios -- --device "你的 iPhone 名称" --no-packager

# Android：连接并授权 USB 调试的设备，或启动模拟器
npm run android -- --no-packager
```

iOS 工作区为 `Example/XLab/ios/XLab.xcworkspace`。当前火山 iOS 二进制提供 arm64 真机和 x86_64 模拟器切片，**没有 arm64 模拟器切片**；不要用此前 Hello World 的 Apple Silicon 模拟器运行结果推断 RTC 可用。优先使用 iPhone 真机。

Android 原生工程为 `Example/XLab/android`。厂商 Maven 仓库已经配置；旧 Support Library 传递依赖需要工程中的 `android.enableJetifier=true`，来源与验证见实现记录。首次构建会下载 Gradle、SDK、NDK 和 Maven 依赖。

运行后在首页选择中国/全球环境，输入 API Key，进入摄像头。空 Key 可看预览，生成需要有效 Key。输入提示词后发送；再次发送更新条件，停止按钮断开生成并保留相机预览，返回释放摄像头。XLab 将两种环境的 Key 分别保存到 iOS Keychain / Android Keystore 支持的本机安全存储，启动时恢复；清空输入会删除对应 Key。SDK 本身不持久化 Key。

本机 Pixel 模拟器若默认宿主地址无法连到 Metro，可执行 `adb reverse tcp:8081 tcp:8081`，在 Dev Settings 中把调试地址设为 `localhost:8081`。这只是本机调试配置，不写入业务 SDK。

App 已连接 Metro 后，在 Metro 终端按 `j` 打开 React Native DevTools。改 TS/TSX 可热更新；改 Pod、Gradle 或原生代码需重新构建。8081 已被当前项目的 Metro 占用时直接复用，不要重复启动。

## 验证

```sh
npm run typecheck
npm run lint
npm run format:check
npm test
npm pack --dry-run
```

`npm test` 构建 CommonJS / ESM / 声明文件，检查已输出的公开声明正负调用，再运行真实 TS 控制层的协议、尺寸与生命周期测试，只有原生边界和 HTTP 被替换。

SDK 保留 strict、noUncheckedIndexedAccess、exactOptionalPropertyTypes、skipLibCheck=false。RN 0.87 类型使用官方 `react-native-legacy-deep-imports` 条件选择兼容声明；运行时仍为新架构。XLab 沿用模板 skipLibCheck=true。具体原因和验证边界见实现记录。

包暂设 private。当前厂商补丁用于仓库开发，尚未提供供外部应用独立安装的受维护厂商修订包，因此 npm pack 成功不代表已可发布。
