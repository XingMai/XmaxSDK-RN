# XLab

RN 0.87.1 的 iOS/Android 示例，包含首页配置、摄像头/图片实时生成和存储服务页面。

所有 npm 和 CocoaPods 操作从仓库根目录执行，见 [运行说明](../../README.md)。请勿在此目录建立第二份 package-lock.json 或单独安装另一份 React/RN。

App → XLabNavigator → FeedScreen / CameraScreen / RealtimeScreen / StorageScreen，各功能页通过 @xmax/react-native-sdk 使用 SDK。

首页右上角语言菜单支持跟随系统、简体中文和 English，并保存最后选择。首页与配置提示使用 `src/localization` 中的独立文案；语言不改变国内/海外 API 环境，也不重建导航或清空 Key。首页字号通过 `feedFont` 保留 iOS 的 1.15 倍缩放，主标题与卡片采用当前 iOS 的较小基准字号。
