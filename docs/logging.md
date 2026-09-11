# SDK 日志

RN 日志按 iOS XmaxLogger 的选项、级别、分类和全局配置语义实现。所有日志默认关闭。

```ts
import { XmaxClient, XmaxLoggerOption } from '@xmax/react-native-sdk';

const client = new XmaxClient({
  apiKey,
  loggerOptions: XmaxLoggerOption.all,
});
```

- `business = 1`：Realtime、API、Room、Stream、Storage、Media、Render、Permission 业务事件和失败。
- `performance = 2`：RTC 收发统计、网络质量、系统指标和性能告警。
- `all = 3`：两者都输出。`0`：全部关闭，包括 SDK 原生推帧异常日志。
- 与 iOS 一样，最后创建的 Client 决定全局选项，影响已有和后续 Manager、独立存储任务。不要用多个 Client 的不同选项期望隔离日志。

## 格式与输出

`debug / info / warn / error` 分别映射原生对应级别。每行都有 `[Xmax][分类]` 前缀，多行指标保留分组。消息在对应开关开启后才格式化；统计日志不读取另一平台不支持的 native-backed getter。日志格式化或输出失败不改变业务的返回或异常。

- iOS：OSLog，subsystem `ai.xmax.XmaxSDK`、category `XmaxSDK`。在 Xcode 调试控制台或 macOS Console 中选择设备/进程后过滤 `[Xmax]`；查看详细指标时开启 info/debug 显示。
- Android：Logcat，tag `XmaxSDK`。可执行 `adb logcat -s XmaxSDK`，也可使用 Android Studio Logcat。
- SDK 日志直接进入原生系统日志，不通过 JS Console 输出，不会因为日志级别是 error 就触发 RN LogBox。第三方 SDK 自身日志不属于 XmaxLogger 管理范围。
- 本次增加了原生 Codegen 方法；已有 App 需要重新编译安装，单独刷新 Metro 不能更新原生接口。

## 覆盖范围

| 类别 | 内容 |
| --- | --- |
| Realtime | 连接状态、操作失败、监听器异常 |
| API | HTTP 方法、脱敏路径、状态、耗时、UTF-8 响应大小、数字 API 错误码、传输/解析错误 |
| Room / Stream | 入房、离房、start/change_condition/stop、信令发送失败码、心跳失败、匹配的任务 SEI 确认 |
| Media / Permission / Render | 相机或图片输入就绪及规格、权限拒绝、后台释放、画布绑定失败、原生推帧异常 |
| Storage | 上传/下载开始、完成、耗时、失败码、进度监听器异常 |
| RTC performance | 收发分辨率、采集/编码/发送/解码/渲染帧率、码率、丢包、RTT、抖动、卡顿、端到端延迟、网络质量、CPU/内存和性能告警 |

仅记录当前已实现功能。没有逐帧日志，也没有复制 iOS 临时 CameraPerformanceProbe 采样。

## 与 iOS 的明确差异

1. RN 保留安全边界：不打印完整失败响应正文，而是输出 HTTP 状态、响应大小和数字业务码。API Key、Token、Secret、鉴权头、提示词、响应中的敏感字段、签名 URL、文件路径、原生异常正文不进入日志。API 路径中的查询参数删除，动态片段替换为 `:id`。
2. 当前火山 RN 1.3.2 封装没有暴露 iOS 的系统总 CPU 使用率，明确显示 `unavailable`。Android 对应字段及双端其他已暴露指标正常记录；缺失指标不填 0。
3. 输出到 Android Logcat 是平台适配；iOS 仍使用系统 OSLog。日志接收界面和 SDK 本身的错误回调相互独立。

## 验证

自动测试覆盖全局过滤、四级日志、多行前缀、懒求值、输出异常隔离、API 成功/失败及敏感信息排除、双端指标 getter、存储错误语义。原生接口通过 iOS / Android Debug 编译；设备端日志查看和完整业务实测由用户执行。
