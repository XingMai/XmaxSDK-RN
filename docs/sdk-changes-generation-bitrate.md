# SDK 改造文档：生成下行码率（start 事件）

基于 `1.0.2`，分支 `demo/v1.0.3-preview`。本次改造为**可选增量**，不传时行为与 1.0.2 完全一致。

| 能力 | 公开 API | 生效范围 |
| --- | --- | --- |
| 生成下行码率 | `RealtimeContext.minimumBitrate` / `maximumBitrate` | 生成 `start` 事件（**当前仅 x2.1-preview 模型有效**） |

---

## 1. 背景

服务端生成任务的推流编码码率（即客户端的**下行**）默认 `2000 / 6000 Kbps`，支持在 `start` 事件 `params` 中通过 `min_bitrate` / `max_bitrate` 指定（见 `dev-docs/start_and_change_target_size_bitrate.md`）。SDK 此前不下发这两个字段，无法调整。

## 2. 接口定义

[src/Service/Realtime/RealtimeTypes.ts](../src/Service/Realtime/RealtimeTypes.ts)

```ts
export interface RealtimeContext {
  readonly prompt: string;
  readonly referencePath?: string | null;
  /**
   * Downlink encoder limits in Kbps within [100, 10000], sent with the start
   * event only. Omitted or null uses server defaults; later context updates
   * keep the task's current values. Minimum must not exceed maximum.
   */
  readonly minimumBitrate?: number | null;
  readonly maximumBitrate?: number | null;
}
```

随 `startGeneration({ context })` 传入。

> **模型限制：当前仅 `x2.1-preview` 模型的生成下行码率生效。** 其他模型（如 x2.0）即使下发 `min_bitrate` / `max_bitrate`，服务端也会忽略，按默认值处理。

## 3. 校验规则

[src/Core/Realtime/XmaxRealtimeGenerationManager.ts](../src/Core/Realtime/XmaxRealtimeGenerationManager.ts) `validateBitrateRange()`

| 规则 | 违例行为 |
| --- | --- |
| 必须是整数 | 抛 `INVALID_CONFIGURATION` |
| 范围 `[100, 10000]` Kbps | 抛 `INVALID_CONFIGURATION` |
| `min ≤ max`（两者都传时） | 抛 `INVALID_CONFIGURATION` |

校验在 `startGeneration()` **连接建立之前**执行（`validateContext`），非法输入不会发出任何 `start` 信令；任务内的兜底校验在 `start()` 重放（覆盖摄像头切换重启路径）。

## 4. 信令序列化

[src/Stream/Room/RoomEvent.ts](../src/Stream/Room/RoomEvent.ts)

```jsonc
{
  "event": "start",
  "user_id": "user-001",
  "uid": "task-...",
  "params": {
    "model": "default",
    "size": [1024, 1920],
    "prompt": "...",
    "min_bitrate": 3000,   // 仅在 start 事件、且字段非空时下发
    "max_bitrate": 8000
  },
  "runtime": { ... }
}
```

- **仅 `start` 事件携带**；`change_condition` 不携带（对齐服务端"不传则保持当前值"语义）
- 字段为 `null` / 未设置时**不下发**该 key，服务端走默认 `2000 / 6000`
- 上下文缓存语义不变：`change_condition` 更新后的 context 成为"最近成功 context"，摄像头切换导致的任务重启会按 `start` 语义携带其中的码率

## 5. 与服务端语义对照

| 客户端行为 | 服务端效果 |
| --- | --- |
| 不传（字段缺失） | 默认 `2000 / 6000` |
| 传 `3000 / 8000` 启动 | 编码区间 `3000–8000`，立即生效 |
| 生成中更新 prompt（change_condition） | 码率保持任务当前值 |

## 6. 上行码率（既有能力）

上行（客户端推流）码率 SDK 早已支持：`RealtimeVideoFormat.minimumBitrate` / `maximumBitrate`（Kbps），经 `CameraStreamOptions` / `ImageStreamOptions` 的 `videoFormat` 传入，最终写入 veRTC `setVideoEncoderConfig` 的 `minBitrate` / `maxBitrate`。

不传时按像素-帧率插值表推导，默认模型对应值：

| 模型 | 默认格式 | min | max |
| --- | --- | --- | --- |
| x2.0 | 832×1472@30 | ≈2089 Kbps | ≈4178 Kbps |
| x2.0-pro / x2.1-preview | 1024×1920@30 | ≈3016 Kbps | ≈6031 Kbps |

## 7. 弱网推荐配置（输入示例）

> **默认建议：网络良好时不要设置码率。** 上行留空由 SDK 按分辨率/帧率自动推导（见第 6 节），下行留空由服务端使用默认 `2000 / 6000 Kbps`，两者已覆盖绝大多数场景。手动设置（尤其是压低码率）会直接牺牲画质，仅在**弱网环境或弱网验证**时按下表设置。

弱网环境建议**同时**收紧上行与下行码率。推荐起点值 `500 / 1500 Kbps`，再按实际网络与画面效果上下调整。

推荐输入值：

| 参数 | 最小 (Kbps) | 最大 (Kbps) | 传入方式 |
| --- | --- | --- | --- |
| 上行码率 | 500 | 1500 | `videoFormat.minimumBitrate` / `maximumBitrate` |
| 下行码率 | 500 | 1500 | `RealtimeContext.minimumBitrate` / `maximumBitrate` |

等效代码：

```ts
// 上行：本地流创建时指定
const local = await realtime.createLocalCameraStream({
  videoFormat: {
    width: 1024,
    height: 1920,
    fps: 30,
    minimumBitrate: 500,
    maximumBitrate: 1500,
  },
});

// 下行：随 start 事件下发（当前仅 x2.1-preview 模型生效）
await realtime.startGeneration({
  localStream: local,
  context: {
    prompt: '把人物改成动漫风格',
    minimumBitrate: 500,
    maximumBitrate: 1500,
  },
});
```

`start` 事件实际下发：

```json
{
  "event": "start",
  "user_id": "user-001",
  "uid": "task-...",
  "params": {
    "model": "default",
    "size": [1024, 1920],
    "prompt": "把人物改成动漫风格",
    "min_bitrate": 500,
    "max_bitrate": 1500
  }
}
```

注意：`500 / 1500` 只是弱网验证起点，非固定推荐值。码率过低画面会糊，过高在弱网下会卡；建议结合 `setNetworkQualityListener` 上报的上下行质量与实测效果调整。

## 8. 兼容性

- 字段为可选，**缺省行为与 1.0.2 完全一致**，存量接入方无需修改
- TypeScript 类型向后兼容（仅新增 optional 字段）
- 无原生（Android/iOS）改动，纯 TS 层变更

## 9. 测试

新增/更新用例（`tests/camera.test.cjs`）：

- `start` 事件携带 `min_bitrate` / `max_bitrate`
- `change_condition` 不重复下发码率字段
- 越界 / 非整数 / `min > max` 的 context 在连接前拒绝，且不发出任何 `start` 信令

全量：`npm test` 237 用例通过。
