# FeedScreen 样式对齐验收

2026-09-10。范围仅首页，当前保留摄像头线路。

## 参考

以 iOS XmaxSDK 当前 UIKit 源码为准（参考仓库 HEAD `b112758`），不是按旧截图中的版本与平台文案复制：

- `Examples/XLab/XLab/Modules/XLFeed/FeedViewController.swift`
  - SHA-256：`8a90ea1cf50d380de438b8a4a2cb79be3a9064734f46f20379c6d2d384eeb22d`
- `Examples/XLab/XLab/Modules/XLFeed/FeedComponents.swift`
  - SHA-256：`47a786d4a88ea0ee400f59bee43fd0cb053fc5a6c0ae3783f3efba3a2dbb5f45`
- 辅助视觉参考：iOS 仓库 `docs/images/xlab/home.jpg`。

对应实现：`../src/screens/FeedScreen.tsx`。图标来源及转换方法见 `../src/assets/feed/README.md`。构建不依赖参考仓库或转换工具。

## 对齐内容

- 菱形品牌标识、版本胶囊、三段背景渐变及蓝/绿光晕。
- 页边距 18、顶部 20、品牌到介绍卡片间距 34；字体按 UIKit 的 1.15 倍换算。
- 介绍卡片、66 高指标行、API Key 与模型合并卡片；描边、圆角、间距及选中模型状态。
- 摄像头卡片的 MODE_01 / CAMERA、READY、01 水印、左侧色条、API 标签与运行按钮。
- 分隔线、版权与邮箱页脚。

适应 RN 当前范围：品牌副标题显示 React Native；版本来自 XmaxSDKInfo；运行平台和最低系统显示实际 RN 工程配置。保留国内/海外选择，压缩放入 API KEY 标题行。只展示已实现的 X2.0 和摄像头入口。模型标识使用 RN 公开名称 `RealtimeModel.x2_0`。

## 已检查

Android Pixel_10 模拟器，API 37 / 420 dpi，RN 0.87.1 Debug：

| 截图                          | 尺寸                       | 检查内容                                     |
| ----------------------------- | -------------------------- | -------------------------------------------- |
| `feed-android-top.png`        | 1080 × 2424，约 411 dp 宽  | 品牌、介绍、指标、API Key、模型、摄像头卡片  |
| `feed-android-bottom.png`     | 同上                       | 摄像头操作行与页脚                           |
| `feed-android-320-top.png`    | 临时 840 × 1800，320 dp 宽 | 窄屏排版、指标标签单行缩放、说明文字自然换行 |
| `feed-android-320-bottom.png` | 同上                       | 完整操作行、页脚可滚动查看                   |

交互：国内/海外单选状态正确；API Key 显隐后系统输入框 password 状态与按钮可访问标签同步；点击运行进入现有摄像头预览并可返回。未输入或保存真实 API Key，未发起云端生成。模拟器尺寸已恢复。

`npm run typecheck`、`npm run lint` 通过，修改文件通过 Prettier 检查。未增加原生依赖，不需要重新编译宿主即可通过 Metro 更新。

本次未做 iOS 真机视觉验收：当前 RTC 二进制缺少 Apple Silicon iOS 模拟器切片。Android 与 iOS 字体栅格和系统安全区存在平台差异；不能将 Android 截图视为 iOS 真机验证结果。
