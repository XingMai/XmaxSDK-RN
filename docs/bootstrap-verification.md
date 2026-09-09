# Hello World 工程验证

2026-09-09。仅基础工程，不代表 RTC/COS 或业务 API 已验证。

| 检查 | 结果 |
| --- | --- |
| SDK ESM / CommonJS / 类型声明构建 | 通过 |
| SDK 与 XLab 应用源码类型检查 | 通过 |
| ESLint / Prettier | 通过 |
| npm pack 内容与 ESM/CommonJS 导入 | 通过，包不含 Example/node_modules/vendor |
| npm workspace 依赖 | React 19.2.3、RN 0.87.1 单份；XLab 通过包名导入 SDK |
| iOS Pods / Debug 构建 | 通过，CocoaPods 1.17.0 / Xcode 26.6 |
| iOS 实际运行 | iPhone 17 模拟器、iOS 26.5，Hello World 与 SDK 0.0.1 已显示 |
| Android 生产 JS bundle | 通过，Metro 生成完整 Android bundle |
| Android Debug 构建 | 未完成；已通过 Gradle 插件编译和工程配置，首次 NDK 下载未完成，已停止本次构建 |
| iOS 15.1 / Android API 26 真机 | 尚未验证 |

本机 Node 26.3.1、npm 11.16.0、JDK 17.0.19；运行时符合 RN engines。截图在 `artifacts/hello-world-ios.png`，本地构建日志在 `/private/tmp/xmax-rn-bootstrap`，二者不是源码发布产物。

Android 使用官方模板的 Gradle 9.4.1 与 NDK 27.1.12297006。Gradle 分发包已按官方 SHA-256 校验，并将校验值固定到 wrapper 配置。约 800 MB 的 NDK 下载缓慢且分段连接发生中断，因此停止了本次 Android 构建尝试。尚未生成或运行 APK；后续安装完依赖后需重新执行 Android 构建，不能据此宣称 Android 原生运行已验证。

官方模板的 ESLint 8.19 与新版插件组合不兼容，工程固定 ESLint 9.39.1 并使用 RN flat config；本项目没有 Flow，因此不启用模板的 Flow-only 规则。

XLab 沿用官方 RN TypeScript 模板的 skipLibCheck=true，只跳过依赖 `.d.ts` 自身检查。此前设置 false 时，RN 0.87.1 的 AnimatedProps、VirtualizedList、ReactNativeDocument，以及 safe-area-context 的原生视图声明报错；升级安全区库至 5.9.1 和 React 类型至 19.2.18 后仍存在。应用源码依然严格检查，StatusBar 的不再支持属性已删除；SDK 自身保留 skipLibCheck=false。后续公开组件 API 落地时应专门验证其类型，不能把本次应用通过当作完整公开契约验收。

SDK 当前只实现 XmaxSDKInfo。没有安装火山/COS，没有生成虚假的实时/存储 API，也没有增加 ExpoHost 或 config plugin。完整 XLab 界面仍按已有 UI 标准后续实施。
