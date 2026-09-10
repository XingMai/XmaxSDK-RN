# 存储页图标

2026-09-10，从 iOS XmaxSDK 的 `Examples/XLab/XLab/Resources/Assets.xcassets/` 复制：

- `sdk_feature_storage.imageset/sdk_feature_storage.png` → `upload.png`，首页存储卡片图标。
- `realtime_nav_back.imageset/realtime_nav_back.png` → `back@3x.png`，沿用原资源 3× 倍率，RN 引用逻辑名称 `back.png`。

图片未修改。运行与打包只读取 Example 自身资源，不依赖 iOS 参考仓库。
