# RTC 1.3.2 开发补丁

来源：`@volcengine/react-native-rtc@1.3.2` npm 发布包，SHA-256 `ce797363e1fad88b6d7daae6dc9c22a9d50dc854374bbe978415a68d2e84fa76`。来源审核见 `docs/vendor-rn-audit.md`。

发布包的 package.json 写 MIT，但随包 LICENSE 实际为 New BSD License；保留该原文于 `VolcEngineRTC-LICENSE.txt`，发布前需解决这项元数据不一致并核对原生 SDK 自身条款，不把 npm 元数据误作二进制授权。

`rtc-1.3.2.json` 的 before/after 为可复现的精确差异；`scripts/apply-vendor-patches.mjs` 校验版本与匹配文本，允许幂等重复执行。根 `prepare` 在 npm ci 时执行，无联网取临时分支。

| 修改 | 原因 |
| --- | --- |
| Android Java target 8 → 17 | 随包 Java 使用较新语法，与固定 JDK / RN 目标一致 |
| Android buildFeatures.buildConfig=true | 模块声明自定义 BuildConfig 字段，AGP 9 默认不生成 |
| iOS / Android extends.d.ts 缺失 hybrid-runtime 导入 | 运行时代码已内嵌，发布包缺声明；补其 NativeView 的实际签名，不安装未公开包 |
| 两个 JS 入口空 viewId → null | 原实现为解绑创建一个空 ID 的假视图；改为传递真正的空视图 |

Android 原生 POM 还引入 Support Library 28，XLab 使用 Jetifier 做 AndroidX 迁移。此项是宿主配置，未在厂商包里随意 exclude 原生库。

这些补丁仅保证本仓库开发可复现。根包 private=true；发布必须使用包含修复的确定上游版本或可独立安装的受维护修订包，并完成 tarball 干净宿主、Debug/Release、R8 和真机验收。禁止要求消费者手改 node_modules。
