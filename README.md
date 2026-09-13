<p align="center">
  <img src="./docs/images/brand/xmax-sdk.png" alt="XmaxSDK — Realtime Interactive Video Generation" width="880">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React_Native-0.87.1-61DAFB" alt="React Native 0.87.1">
  <img src="https://img.shields.io/badge/TypeScript-6.0-3178C6" alt="TypeScript 6.0">
  <img src="https://img.shields.io/badge/iOS-15.1%2B-007AFF" alt="iOS 15.1+">
  <img src="https://img.shields.io/badge/Android-API_26%2B-3DDC84" alt="Android API 26+">
</p>

React Native SDK, providing access to Xmax's real-time, interactive video generation models. The models are optimized for low latency and cost efficiency, enabling instantaneous video transformations across diverse characters, outfits, and aesthetic styles. Also, they can dynamically respond to user gestures, allowing interactive virtual subjects to blend into real-world footage for immersive experiences. XmaxSDK implements an end-to-end pipeline to leverage these novel capabilities through concise TypeScript APIs, making it easy for developers to build next-generation interactive video experiences across the iOS and Android ecosystems.

<!-- Product demos from the iOS XLab reference application. -->
<p align="center"><img src="./docs/images/xlab/generation-demo.gif" alt="X-Lab realtime generation demo" width="33%" /><img src="./docs/images/xlab/index-demo.gif" alt="X-Lab index demo" width="33%" /><img src="./docs/images/xlab/storage-demo.gif" alt="X-Lab storage demo" width="33%" /></p>

<br>

## What XmaxSDK does

XmaxSDK offers a complete workflow that covers media acquisition, low-latency video communication, frame-by-frame generation, and in-app rendering. Whether processing live camera feeds, pre-recorded video, or still images, it streams media to our cloud inference service, applies on-device enhancement to the returned video, and renders the result to screen. With the entire workflow abstracted into simple API calls, integrating real-time video generation is seamless and intuitive.

<br>

## What you can build with XmaxSDK

<table>
  <tr>
    <th width="24%" align="left">Realtime Use Case</th>
    <th width="60%" align="left">Description</th>
    <th width="16%" align="center">Demo</th>
  </tr>
  <tr>
    <td rowspan="2" width="24%" valign="middle">
      <strong>Character Swapping</strong>
    </td>
    <td width="60%" valign="middle">
      Replace anyone in your live feed with a designated avatar in real-time.
    </td>
    <td rowspan="2" width="16%" align="center" valign="middle">
      <a href="https://cdn.jsdelivr.net/gh/XingMai/XmaxSDK-iOS@88182780abe60b3df1c44f549487fcf8ab4b660c/docs/videos/use-cases/character-swapping.mp4">
        <img src="./docs/images/use-cases/character-swapping-poster.png" alt="Play the Character Swapping demo" width="120">
        <br>
        <sub>▶ Play demo</sub>
      </a>
    </td>
  </tr>
  <tr>
    <td width="60%" valign="middle">
      <strong>Prompt:</strong> <code>视频中角色替换成参考图中角色</code>
      <br><br>
      <strong>Reference image:</strong> Select a clear image of the desired character with a clean background.
    </td>
  </tr>
  <tr>
    <td rowspan="2" width="24%" valign="middle">
      <strong>Virtual Try-On</strong>
    </td>
    <td width="60%" valign="middle">
      Seamlessly change outfits, preserving exact body shape, natural motion, and an
      authentic fit.
    </td>
    <td rowspan="2" width="16%" align="center" valign="middle">
      <a href="https://cdn.jsdelivr.net/gh/XingMai/XmaxSDK-iOS@88182780abe60b3df1c44f549487fcf8ab4b660c/docs/videos/use-cases/virtual-try-on.mp4">
        <img src="./docs/images/use-cases/virtual-try-on-poster.png" alt="Play the Virtual Try-On demo" width="120">
        <br>
        <sub>▶ Play demo</sub>
      </a>
    </td>
  </tr>
  <tr>
    <td width="60%" valign="middle">
      <strong>Prompt:</strong> <code>视频中人物衣服替换成参考图中衣服</code>
      <br><br>
      <strong>Reference image:</strong> Select a clear image of the target outfit with a clean background.
    </td>
  </tr>
  <tr>
    <td rowspan="2" width="24%" valign="middle">
      <strong>Video Restyling</strong>
    </td>
    <td width="60%" valign="middle">
      Reimagine your world in any style with an immersive visual experience.
    </td>
    <td rowspan="2" width="16%" align="center" valign="middle">
      <a href="https://cdn.jsdelivr.net/gh/XingMai/XmaxSDK-iOS@88182780abe60b3df1c44f549487fcf8ab4b660c/docs/videos/use-cases/video-restyling.mp4">
        <img src="./docs/images/use-cases/video-restyling-poster.png" alt="Play the Video Restyling demo" width="120">
        <br>
        <sub>▶ Play demo</sub>
      </a>
    </td>
  </tr>
  <tr>
    <td width="60%" valign="middle">
      <strong>Prompt:</strong> <code>视频风格变为参考图指定的风格</code>
      <br><br>
      <strong>Reference image:</strong> Select an image that captures the artistic style you want to apply.
    </td>
  </tr>
  <tr>
    <td rowspan="2" width="24%" valign="middle">
      <strong>AI Companions</strong>
    </td>
    <td width="60%" valign="middle">
      Summon virtual characters into your live camera feed and interact with them
      through gestures.
    </td>
    <td rowspan="2" width="16%" align="center" valign="middle">
      <a href="https://cdn.jsdelivr.net/gh/XingMai/XmaxSDK-iOS@88182780abe60b3df1c44f549487fcf8ab4b660c/docs/videos/use-cases/ai-companions.mp4">
        <img src="./docs/images/use-cases/ai-companions-poster.png" alt="Play the AI Companions demo" width="120">
        <br>
        <sub>▶ Play demo</sub>
      </a>
    </td>
  </tr>
  <tr>
    <td width="60%" valign="middle">
      <strong>Prompt:</strong> <code>指定角色在场景中互动</code>
      <br><br>
      <strong>Reference image:</strong> Select a clear image of the virtual character you want to summon with a clean background.
    </td>
  </tr>
  <tr>
    <td rowspan="2" width="24%" valign="middle">
      <strong>Live Photo</strong>
    </td>
    <td width="60%" valign="middle">
      Animate and control characters in your images simply by drawing motion
      trajectories.
    </td>
    <td rowspan="2" width="16%" align="center" valign="middle">
      <a href="https://cdn.jsdelivr.net/gh/XingMai/XmaxSDK-iOS@4351aa869d4e24fd40690c670d8949bff270dee0/docs/videos/use-cases/live-photo.mp4">
        <img src="./docs/images/use-cases/live-photo-poster.png" alt="Play the Live Photo demo" width="120">
        <br>
        <sub>▶ Play demo</sub>
      </a>
    </td>
  </tr>
  <tr>
    <td width="60%" valign="middle">
      <strong>Prompt:</strong> <code>让画面自然动起来</code>
      <br><br>
      <strong>Reference image:</strong> Use the input image as the reference
    </td>
  </tr>
</table>

<br>

## Why XmaxSDK?

<table>
  <thead>
    <tr>
      <th height="104" align="center" valign="middle">
        <img src="./docs/images/why/low-latency.svg" alt="Low latency" width="36" height="36"><br>Low latency
      </th>
      <th height="104" align="center" valign="middle">
        <img src="./docs/images/why/low-cost.svg" alt="Cost efficiency" width="36" height="36"><br>Cost efficiency
      </th>
      <th height="104" align="center" valign="middle">
        <img src="./docs/images/why/high-fidelity.svg" alt="High fidelity" width="36" height="36"><br>High fidelity
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>End-to-end latency is measured in <img src="./docs/images/why/latency-highlight.svg" alt="hundreds of milliseconds" width="192" height="20" align="absmiddle">, ensuring that updates to generation conditions and interaction controls are reflected instantly.</td>
      <td>Run on a <img src="./docs/images/why/gpu-highlight.svg" alt="single RTX 5090" width="126" height="20" align="absmiddle">, reducing inference costs by orders of magnitude versus datacenter GPUs like H100.</td>
      <td>Our models support real-time generation at up to <img src="./docs/images/why/resolution-highlight.svg" alt="1080p" width="48" height="20" align="absmiddle">, delivering production-ready, high-quality video output.</td>
    </tr>
  </tbody>
</table>

<br>

## Prerequisites

- iOS 15.1 or later / Android API 26 or later
- React Native 0.87.1 / React 19.2.3, New Architecture
- TypeScript 6
- An Xmax API key

> [!WARNING]
> Never commit your Xmax API key to version control. Pass it securely at
> runtime or use short-lived temporary keys issued by the Xmax API. For step-by-step
> instructions, see [Authentication](https://platform.xmaxai.com/docs/authentication).

<br>

## Installation

The repository currently sets `private: true` in `package.json`. Use the
**XLab workspace** to run and develop the SDK. Dependency adaptations are included
in the SDK; no repository patches are required. Public npm distribution still
requires updating the package's publishing and license metadata.

From the repository root:

```sh
npm ci
```

For iOS, install CocoaPods dependencies:

```sh
bundle install
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer npm run pods
```

Start Metro:

```sh
npm start
```

Keep Metro running and launch the app from another terminal:

```sh
# iPhone: configure your signing team in Xcode first.
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer npm run ios -- --device "Your iPhone" --no-packager

# Android: connect a device or start an emulator.
npm run android -- --no-packager
```

The iOS workspace is [`Example/XLab/ios/XLab.xcworkspace`](./Example/XLab/ios/XLab.xcworkspace).
The pinned RTC binary does not include an arm64 iOS Simulator slice; use an iPhone
for the iOS example. Native dependency changes require rebuilding the app.

<br>

## Quick Start

### Configure permissions

Add a camera usage description to your application's `Info.plist`:

```xml
<key>NSCameraUsageDescription</key>
<string>This app uses the camera for real-time video input.</string>
```

Customize this message to match your application's user experience. XmaxSDK
automatically prompts for camera access when creating the video stream and throws
an `XmaxError` if permission is denied or unavailable.

<br>

For Android, add permissions to your application's `AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.INTERNET" />
```

If enabling microphone input, also add `NSMicrophoneUsageDescription` to the iOS
`Info.plist`. XLab already includes this configuration.

<br>

### Generate and display video

The following TypeScript snippet creates a camera stream, starts real-time generation,
and binds the output to a video view. Run this within an async screen action.

```tsx
import {
  XmaxClient,
  RealtimeModel,
  CameraPosition,
} from '@xmaxai/react-native-sdk';

const client = new XmaxClient({ apiKey: 'YOUR_XMAX_API_KEY' });

const realtime = client.createRealtimeManager({
  model: RealtimeModel.x2_0,
});

const localStream = await realtime.createLocalCameraStream({
  videoFormat: { width: 704, height: 1280, fps: 24 },
  position: CameraPosition.front,
});
setLocalTrack(localStream.videoTrack);

const remoteStream = await realtime.connect({ localStream });
setRemoteTrack(remoteStream.videoTrack);

// Bind the remote track before waiting for generation confirmation.
await realtime.startGeneration({
  context: {
    prompt: '视频中角色替换成参考图中角色',
    referencePath: 'https://platform.xmaxai.com/images/source/charx/chatx_image1.jpg',
  },
});
```

Add the video view to your view hierarchy. The view displays a local camera
preview until the first generated frame arrives.

<br>

### Using React Native

Use `XmaxRealtimeVideo` as your primary React Native view. Store the local and remote
tracks in React state, updating them dynamically as streams become available:

```tsx
import { useState } from 'react';
import {
  XmaxRealtimeVideo,
  VideoContentMode,
  type RealtimeVideoTrack,
} from '@xmaxai/react-native-sdk';

// Inside your screen component:
const [localTrack, setLocalTrack] = useState<RealtimeVideoTrack | null>(null);
const [remoteTrack, setRemoteTrack] = useState<RealtimeVideoTrack | null>(null);

<XmaxRealtimeVideo
  localTrack={localTrack}
  remoteTrack={remoteTrack}
  videoContentMode={VideoContentMode.fill}
  style={{ flex: 1 }}
/>
```

See the [example project](#example-project) for state binding and a complete implementation.

<br>

### Realtime models

Select `RealtimeModel.x2_0_pro` when creating a realtime manager or media service.
XLab offers both models on Home and remembers the selected model for future sessions.

| Model | Default camera format | Input resolution policy |
| --- | --- | --- |
| `x2_0` (`x2.0`) | 832 × 1472 at 30 fps | 600,000–1,280,000 pixels; dimensions aligned to 32 |
| `x2_0_pro` (`x2.0-pro`) | 1024 × 1920 at 30 fps | Exactly 1024 × 1920 or 1920 × 1024 |

Pro follows the iOS SDK: unsupported input dimensions are rejected, not automatically
resized to a bucket. Image sources use the model's default frame rate when omitted;
explicit valid frame rates are preserved. The Pro maximum input pixel metadata is
2,100,000, though fixed resolution buckets take precedence over pixel bounds.

`RealtimeVideoFormat` also accepts `minimumBitrate` and `maximumBitrate` in kbps.
Omit either value or pass `null` to use its SDK default; a minimum of `0` means
no minimum bitrate. `encoderPreference` defaults to
`RealtimeVideoEncoderPreference.auto`; `maintainFramerate` and `maintainQuality`
are also available. These settings are preserved when input dimensions are resized.
Camera and image streams start with remote audio muted. Call
`setRemoteAudioVolume()` after creating the local stream to change the volume.

### Touch interaction and trajectory effects

`XmaxVideo` and `XmaxRealtimeVideo` enable interaction by default on confirmed,
visible remote video during generation. `isInteractionEnabled={false}` disables
both touch sampling and effects. Local previews stay passive. The SDK maps fit/fill
coordinates to model pixels, ignores fit black bars, and sends multi-touch `tracks`
samples at 30 Hz, including stationary touches. Stop, disconnect, backgrounding,
view removal and task replacement clear pending samples and animation resources.

The default effect has a white core and green glow. To replace its visuals, pass a
stable `trajectoryRenderer` implementing `TrajectoryEffectRendering`: `view` is a
passive React element, and `renderBegan`, `renderMoved`, `renderEnded` and `reset`
follow the iOS method names. `TrajectoryPoint` contains a stable `id`, viewport
`location`, video-relative `normalizedLocation` and a monotonic `timestamp` in
seconds. Use a separate renderer instance for each mounted video; replacement
resets the previous renderer. Passing `null` restores the default.

`DefaultTrajectoryEffectRenderer` can also be subclassed by overriding
`colorsForTrajectory` with six-digit hex `core` and `glow` colors. The XLab custom
trajectory card demonstrates alternating pink/blue fingers on image input. The
RN effect uses bounded View primitives rather than the iOS bitmap renderer;
device performance and exact visual parity still require device validation.

<br>

### Listen for events

After creating `realtime`, register the listeners you need before creating the
input stream or starting generation.

| Listener | Purpose |
| --- | --- |
| `setStateListener` | Observe pipeline states during real-time generation. |
| `setNetworkQualityListener` | Monitor uplink and downlink network quality. |
| `setPerformanceAlarmListener` | Detect device performance limitations or recovery, with a suggested video format when available. |

Local media moves through `Idle → Preparing → Ready`. A camera becomes `Ready`
after its first valid frame and preview binding. A connection moves through
`Connecting → Connected → Generating`; termination passes through `Disconnecting`
and ends in `Ready` when local media is retained, or `Idle` after `close()`.

`state.reason` is `null` during a new operation and describes termination as
`normal`, `orientationChanged`, or `failure` (with an `XmaxError`). The final state
retains the most recent session ID and clears the task ID. Awaited operation
errors reject their promises; background lifecycle failures arrive through
`state.reason`. `orientationChanged` can be supplied to `disconnect({ reason })`;
the RN SDK does not automatically handle device rotation. For example:

```ts
await realtime.setStateListener(state => {
  setConnectionState(state.connectionState);
  if (state.reason?.type === 'failure') {
    const error = state.reason.error;
    setErrorMessage(`${error.code} ${error.message}`);
  }
});
```

Use `XmaxError.from(error)` to normalize caught errors. It preserves recognized
SDK error codes returned by the native bridge; unknown codes become
`INTERNAL_ERROR`. Display `error.message` to retain the specific failure reason,
and use `apiCode` and `httpStatus` when available. HTTP transport failures,
including request timeouts, use `NETWORK_ERROR`; cancelled requests use
`CANCELLED`. RTC join and generation-confirmation timeouts still use `TIMEOUT`.

<br>

### Cancel an operation

Camera/image creation, connection, generation, camera switching and local stream
stopping accept an optional `signal`. Use `AbortController` to cancel a call,
then await its promise before starting its replacement:

```ts
import { XmaxError, XmaxErrorCode } from '@xmaxai/react-native-sdk';

const controller = new AbortController();
const pending = realtime.startGeneration({
  localStream,
  context: { prompt: 'Watercolor' },
  signal: controller.signal,
});
// On cancellation:
controller.abort();
try {
  await pending;
} catch (error) {
  if (XmaxError.from(error).code !== XmaxErrorCode.cancelled) throw error;
}
```

Cancellation rejects with `CANCELLED` after the operation unwinds and its required
cleanup completes. Cancelling initial generation releases the connection while
keeping local media. Cancelling a context update preserves the existing task.
A completed call is unaffected by a later abort. Concurrent operations reject;
`disconnect()` and `close()` interrupt active work and always finish cleanup.
Cancellation reaches in-flight session requests, and stopping a heartbeat aborts
its pending request. If a session response arrives before cancellation takes
effect, the SDK closes that session during cleanup. Independent storage tasks
are unaffected by realtime teardown; each storage task accepts its own `signal`.

<br>

### Resource Cleanup

- **`disconnect()` — Stop Remote Generation**

  Stops remote generation and cancels billing while keeping the local camera stream
  and preview active. Use this when ending the online session but staying on the
  current screen. You can start a new session later using the same local stream:

  ```ts
  await realtime.disconnect()
  ```

- **`close()` — Full Teardown & Release**

  Ends the remote session, stops local media capture, and releases all engine
  resources. Use this when leaving or dismissing the generation screen:

  ```ts
  await realtime.close()
  ```

> **Note:** These methods are alternatives, not sequential steps. When exiting a
> screen, call `close()` directly—there is no need to call `disconnect()` first.

<br>

> [!TIP]
> For complete React Native usage examples, including image inputs and reference
> images, see the [example project](./Example/XLab).

<br>

## Example Project

A complete example application featuring a React Native implementation
is available in [`Example/XLab`](./Example/XLab).
It demonstrates real-time generation using live camera feeds and static images.

<p align="center"><img src="./docs/images/xlab/home.jpg" alt="X-Lab home" width="20%" /><img src="./docs/images/xlab/features.jpg" alt="X-Lab SDK features" width="20%" /><img src="./docs/images/xlab/storage.jpg" alt="X-Lab storage service" width="20%" /><img src="./docs/images/xlab/realtime-generation.jpg" alt="X-Lab realtime generation" width="20%" /><img src="./docs/images/xlab/trajectory-generation.jpg" alt="X-Lab trajectory generation" width="20%" /></p>

The galleries show the iOS XLab reference application.

<br>

## Dependencies

- <ins><strong>VolcEngine RTC SDK</strong></ins> enables low-latency, real-time audio and video communication.
- <ins><strong>Tencent Cloud COS SDK</strong></ins> handles media upload and download via object storage.

<br>

## Contact us

For bug reports and feature requests, please open a
[GitHub Issue](https://github.com/XingMai/XmaxSDK-RN/issues). For integration
assistance and technical support, contact us at [sdk@xmax.ai](mailto:sdk@xmax.ai).

<br>

## License

The RN package is currently marked `UNLICENSED` and private. Public distribution
terms have not been added to this repository.
