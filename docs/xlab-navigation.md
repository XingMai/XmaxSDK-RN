# XLab 页面导航

2026-09-10。XLab 使用 React Navigation 的原生栈替代 App 内的条件渲染切页。进入功能页时首页保留在栈底，返回使用 goBack，不重新创建首页，因此保留 ScrollView 滚动位置和页面内状态。

## 工程配置

- 仅 Example 安装 `@react-navigation/native` 7.3.18、`@react-navigation/native-stack` 7.18.10、`react-native-screens` 4.27.0；复用 safe-area-context 5.9.1。SDK 不新增导航依赖。
- 版本参考 [Screens 4.27.0 发布记录](https://github.com/software-mansion/react-native-screens/releases/tag/4.27.0) 的 RN 0.87 支持，以及 npm peerDependencies。安装步骤参考 [React Navigation](https://reactnavigation.org/docs/getting-started/)。
- iOS 自动链接 RNScreens 并更新 Podfile.lock；Android MainActivity 按 [Screens 4.27.0 安装说明](https://github.com/software-mansion/react-native-screens/blob/4.27.0/README.md#android) 在 super.onCreate 前设置 RNScreensFragmentFactory，处理 Activity 恢复。
- 新增原生依赖，需要重新编译安装 App；单纯 Metro 重载不能添加 RNScreens。

## 路由与生命周期

`Example/XLab/src/navigation/XLabNavigator.tsx` 集中定义 Feed、Camera、Image、Storage。导航容器与路由组件类型稳定，配置保存引起的重渲染不会重建页面。沿用现有自绘顶部按钮，不显示第二套导航栏；页面使用横向进入/退出转场，视频画面继续保持无淡入。

路由只传环境与图片 URI，API Key 由配置 Context 提供，不放入导航参数。不持久化导航栈，冷启动仍从首页开始；首页滚动位置的保留范围是本次运行的 push/pop。

实时页面使用 [usePreventRemove](https://reactnavigation.org/docs/use-prevent-remove/) 统一处理自绘返回按钮、系统返回与侧滑返回：先取消当前操作并等待 manager.close，然后重新派发原导航 action。重复返回合并，退出中的前台恢复不会重新启动相机；意外卸载仍保留原有 close 清理。进入功能页后不从该页继续 push 新媒体页面。

存储页由导航处理系统返回，移除重复 BackHandler；出栈卸载后由现有 useStorage 清理逻辑取消上传、回收所选临时文件。首页选图回调仅在首页仍聚焦时进入目标页面。

## 验收范围

已通过 TypeScript、ESLint、Prettier 检查与 46 项既有测试；Android Debug / Release 构建及 iOS 真机目标 Debug / Release 无签名构建均通过。iOS Pods 已安装并更新锁文件。

按用户约定只运行代码检查、既有逻辑测试与双端编译。需用户检查：首页滚到中部/底部后进入三个功能页并返回、重复进出、返回按钮/系统返回/侧滑、实时准备或生成中返回、前后台、存储上传中返回。此次不运行云端生成、不安装到设备，也不将编译通过视为已完成视觉验收。
