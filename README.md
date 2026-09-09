# XmaxSDK for React Native

基础工程已建立：RN 0.87.1 / React 19.2.3、TypeScript SDK 构建、npm workspaces，以及 iOS/Android 原生示例 `Example/XLab`。

当前示例显示 **Hello World**，并从 `@xmax/react-native-sdk` 导入 `XmaxSDKInfo.version`。实时生成、RTC/COS 和完整 XLab UI 尚未接入。Expo 暂缓。

## 安装

在本目录执行，只有根目录的一份 npm lock：

```sh
npm ci
bundle install
npm run pods
```

Node 推荐使用 `.nvmrc` 的 22.13.0；RN 同时支持 `^24.3.0` 和 `>=26.0.0`。iOS 使用 Xcode 26.4+、CocoaPods 1.17.0；Android 使用 JDK 17，并配置 `ANDROID_HOME`。SDK/示例的最低系统为 iOS 15.1、Android API 26。

如果本机默认选择了 Xcode beta，可以为当前命令指定稳定版本，不必修改系统全局设置：

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer npm run pods
```

启动 iOS 时也可以在 `npm run ios` 前加同样的 `DEVELOPER_DIR`，确保安装 Pods 和编译使用同一套 Xcode。

## 运行

先启动 Metro，再在另一终端启动目标 App：

```sh
npm start
```

```sh
npm run ios -- --simulator "iPhone 17" --no-packager
# 或连接 Android 设备 / 启动模拟器后：
npm run android -- --no-packager
```

首次 Android 构建会下载 Gradle、SDK/NDK 及 Maven 依赖。原生工程也可直接打开 `Example/XLab/ios/XLab.xcworkspace` 或 `Example/XLab/android`。

## 检查与 SDK 构建

```sh
npm run typecheck
npm run lint
npm run format:check
npm run build
npm pack
```

SDK 输出 CommonJS、ESM 和 `.d.ts` 到 `lib/`。包暂设 private，避免误发布。设计契约没有实现的方法不会被导出为占位 API。

SDK 使用 strict、noUncheckedIndexedAccess、exactOptionalPropertyTypes、skipLibCheck=false。XLab 保持应用代码 strict，但沿用 RN 模板的 skipLibCheck=true：RN 0.87.1 和安全区组件的上游声明目前存在不一致，详见 [构建记录](docs/bootstrap-verification.md)。没有修改 node_modules 的声明或关闭应用代码类型检查。

## 结构与文档

- `src/index.ts`：当前 SDK 入口，导出 XmaxSDKInfo。
- `Example/XLab/src/screens/HelloWorldScreen.tsx`：Hello World 页面。
- `Example/XLab/src/theme/tokens.ts`：沿用 iOS XLab 的基础配色。
- [工程标准](docs/engineering-baseline.md) / [架构](docs/architecture.md)。
- [Git 提交与分支约定](docs/git-workflow.md)。
- [API 语义](docs/public-api.md) / [设计契约](docs/public-api.d.ts)。
- [XLab UI 要求](docs/xlab-ui.md) / [厂商能力核对](docs/vendor-rn-audit.md)。

业务架构按 iOS 的 Core / Service / Media / Stream / Render / Foundation 落地；仅在实现对应功能时创建文件。已有 iOS XmaxSDK 不作为构建或运行依赖。
