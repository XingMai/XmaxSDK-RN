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

## 存储依赖修补（2026-09-10）

`cos-1.3.0.json` 对应 `react-native-cos-sdk-nobeacon@1.3.0`：Android namespace、BuildConfig、Java 17；发布声明的 `src/cos_transfer` 绝对导入改为相对导入；iOS HTTPS 布尔值正确转换；按同一传输的 callback group 清理结果、进度、状态、分片回调，覆盖启动拒绝及取消，避免原包用结果 key 清理其他不同 key 后残留监听。TS / CommonJS / ESM 入口同步，生成 JS 使用本项目 TypeScript 6.0.3 的 ES2020 transpileModule（esModuleInterop）。许可证原文见 COS-LICENSE.txt。

XLab 的 react-native.config.js 明确选择 nobeacon podspec，实际依赖 QCloudCOSXML/Slim 与 QCloudCore/WithoutMTA 6.5.5。Bridgeless Android 已运行原生 COS 上传进度、成功回调；iOS 使用原包 CosEventEmitter 通道，编译通过但未真机验证。

`blob-util-0.24.10.json` 对应 `react-native-blob-util@0.24.10`：补齐发布包漏发的两份声明，保持 skipLibCheck=false；修复 mv 覆盖已有下载文件的差异，Android API 26+ 同目录原子移动，iOS replaceItemAtURL，避免 Android 先删除旧文件和 iOS 直接拒绝覆盖。许可证原文见 BlobUtil-LICENSE.txt。

根 prepare 统一校验并重放上述补丁。仍属于本仓库开发期修补，正式 npm 消费者支持条件不变。

## RTC 事件异常诊断（2026-09-10）

两个 JS 入口的 `_onCallEventEmit` catch 改为显式输出 Error 的 name/message/stack，以及每个参数的顶层字段名（最多 16 个）。原日志对 Error 直接 JSON.stringify，结果通常为 `{}`。不输出参数值、SEI 字节或原生实例 ID；不修改回调返回行为、不吞掉错误，也不打开全量 debug 日志。该补丁随 prepare 重放。

本地 `tests/rtc-event-diagnostics.test.cjs` 执行已安装厂商 bundle 的实际解码器、事件包装与日志路径：原生引用形式的 RemoteStreamKey 在 streamIndex getter 中抛出 `invalid value:undefined`，SEI/decoded/rendered 三类均可复现；字段完整的数据对象则正常传递。它证明存在这条失败路径，尚不证明用户设备此次事件采用了相同参数结构。需用户重新触发并结合新增日志确认；本次未修改生成或参数转换行为。

## Android StreamIndex 回调修复（2026-09-10）

用户 15:49 的日志确认本次错误是 `invalid value:STREAM_INDEX_MAIN`，不是上节模拟的 undefined。SEI/远端解码首帧/远端渲染首帧均在读取 RemoteStreamKey.streamIndex 时进入同一个失败路径。Android 回调对象中此字段为枚举名称字符串，RTC RN 1.3.2 的 t_StreamIndex.android_to_ts 原来仅有数字映射。

两个 JS 入口只为 Android 入站 StreamIndex 增加精确的 STREAM_INDEX_MAIN / STREAM_INDEX_SCREEN 映射；保留数字兼容、未知值错误、iOS 转换和出站协议。不跳过 SEI，也不把所有字符串默认归为主流。补丁纳入 rtc-1.3.2.json 和 prepare，可重复安装重放。

新增测试先在修复前复现三个回调均无法交付，修复后通过真实厂商 MessageProto/事件分发/包装层验证主流、屏幕流、数字枚举，以及 Base64 SEI 解码后内容一致；另测未知输入仍失败及 iOS 行为保持。运行端完整生成结果仍由用户验收，本轮未操作设备发起生成。

本轮 typecheck、ESLint、Prettier、40 项测试以及 Android/iOS Release JS 打包均通过；prepare 再次执行验证幂等。未修改原生实现，未重新安装或启动设备。
