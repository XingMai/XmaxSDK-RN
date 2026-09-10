# XLab

RN 0.87.1 的 iOS/Android 示例，包含首页配置、摄像头/图片实时生成和存储服务页面。

所有 npm 和 CocoaPods 操作从仓库根目录执行，见 [运行说明](../../README.md)。请勿在此目录建立第二份 package-lock.json 或单独安装另一份 React/RN。

App → XLabNavigator → FeedScreen / CameraScreen / RealtimeScreen / StorageScreen，各功能页通过 @xmax/react-native-sdk 使用 SDK。
