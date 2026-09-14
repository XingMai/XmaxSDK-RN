import './RtcTypeCompatibility';
import { XmaxLogger } from '../Logging/XmaxLogger';
import { RtcStatsLogger } from './RtcStatsLogger';
import { detachRtcCanvas } from './RtcCanvasBinding';
import { rtcEngineInstanceID } from './RtcEngineReference';
import { PermissionsAndroid, Platform } from 'react-native';
import {
  RTCManager as VendorRTCManager,
  CameraId,
  MirrorType,
  StreamIndex,
  RenderMode,
  ChannelProfile,
  RoomMessageSendResult,
  VideoCaptureConfig,
  VideoEncoderConfig,
  RTCVideoEncoderPreference,
  t_RTCVideoEncoderPreference,
  VideoSourceType,
  VideoOrientation,
  VideoRotation,
  type IEngine,
  type IRoom,
  type RemoteStreamKey,
} from '@volcengine/react-native-rtc';
import NativeRuntime from '../Native/NativeXmaxRuntime';
import {
  cancelledError,
  invalid,
  XmaxError,
  XmaxErrorCode,
} from '../Errors/XmaxError';
import { ensureActive, waitFor } from '../Runtime/Async';
import {
  CameraPosition,
  RealtimePerformanceStatus,
  RealtimeNetworkQualityLevel,
  type RealtimeVideoFormat,
  type RealtimeNetworkQuality,
  type RealtimePerformanceAlarm,
  VideoContentMode,
  RealtimeVideoEncoderPreference,
} from '../../Service/Realtime/RealtimeTypes';
import type { RealtimeSessionConnection } from '../../Service/Realtime/RealtimeSessionService';
import type { RuntimeInfo } from '../Runtime/RuntimeInfo';

/**
 * The room and user identity of a remote RTC stream.
 */
export type RemoteStream = { roomID: string; userID: string };

/**
 * Normalized native events consumed by the SDK control and rendering layers.
 */
export type RtcEvent =
  | { type: 'localFrame' }
  | {
      type: 'rendered' | 'decoded';
      stream: RemoteStream;
      width: number;
      height: number;
    }
  | { type: 'sei'; stream: RemoteStream; message: string }
  | { type: 'error'; error: XmaxError; scope?: 'connection' | 'all' }
  | { type: 'quality'; quality: RealtimeNetworkQuality }
  | { type: 'performance'; alarm: RealtimePerformanceAlarm };

const qualities = [
  RealtimeNetworkQualityLevel.unknown,
  RealtimeNetworkQualityLevel.excellent,
  RealtimeNetworkQualityLevel.good,
  RealtimeNetworkQualityLevel.poor,
  RealtimeNetworkQualityLevel.bad,
  RealtimeNetworkQualityLevel.veryBad,
  RealtimeNetworkQualityLevel.down,
];

const check = (status: number | undefined, action: string) => {
  if (status !== undefined && status < 0) {
    XmaxLogger.rtc.error(() => `${action} failed: ${status}`);
    throw new XmaxError({
      code: XmaxErrorCode.rtcError,
      message: `${action} failed (${status})`,
    });
  }
};

const remote = (key: RemoteStreamKey): RemoteStream => ({
  roomID: key.roomId,
  userID: key.userId,
});

/**
 * Encapsulates vendor RTC objects, native ownership and lifecycle cleanup.
 *
 * Filters stale events and exposes only SDK-owned types to the layers above.
 */
export class RtcManager {
  private vendor = new VendorRTCManager();
  private engine: IEngine | null = null;
  private room: IRoom | null = null;
  private connection: RealtimeSessionConnection | null = null;
  private owner: string | null = null;
  private creating: Promise<void> | null = null;
  private closing: Promise<void> | null = null;
  private listeners = new Set<(event: RtcEvent) => void>();
  private audioVolume = 0;
  private imageSource = false;
  private imageTaskID: string | null = null;
  private readonly interactionMessages = new Set<number>();
  private readonly views = new Map<string, string>();
  readonly runtime: RuntimeInfo;

  constructor() {
    this.runtime = {
      ...(JSON.parse(NativeRuntime.runtimeInfo()) as Omit<
        RuntimeInfo,
        'sdk_version'
      >),
      sdk_version: '1.0.1',
    };
  }

  randomUUID(): string {
    return NativeRuntime.randomUUID();
  }

  onEvent(listener: (event: RtcEvent) => void): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: RtcEvent): void {
    if (event.type === 'error')
      XmaxLogger.rtc.error(() => `RTC operation failed: ${event.error.code}`);
    for (const listener of [...this.listeners]) listener(event);
  }

  private get active(): boolean {
    return this.owner !== null && NativeRuntime.isActive(this.owner);
  }

  private requireEngine(): IEngine {
    if (!this.engine || !this.active) throw cancelledError();

    return this.engine;
  }

  async permissions(microphone: boolean): Promise<void> {
    let result: string;

    if (Platform.OS === 'android') {
      const camera = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.CAMERA,
      );

      result =
        camera === PermissionsAndroid.RESULTS.GRANTED ? 'granted' : 'camera';
      if (result === 'granted' && microphone)
        result =
          (await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          )) === PermissionsAndroid.RESULTS.GRANTED
            ? 'granted'
            : 'microphone';
    } else result = await NativeRuntime.requestPermissions(microphone);
    if (result !== 'granted')
      XmaxLogger.permission.warn('Camera or microphone permission denied');
    if (result !== 'granted')
      throw new XmaxError({
        code:
          result === 'camera'
            ? XmaxErrorCode.cameraPermissionDenied
            : XmaxErrorCode.microphonePermissionDenied,
        message:
          result === 'camera'
            ? 'Camera permission is required. Enable it in Settings.'
            : 'Microphone permission is required. Enable it in Settings.',
      });
  }

  async open(signal: AbortSignal): Promise<void> {
    ensureActive(signal);
    if (this.engine) {
      this.requireEngine();
      return;
    }
    if (this.closing || this.creating) throw invalid('RTC engine is busy');

    const owner = this.randomUUID();

    this.creating = (async () => {
      if (Platform.OS === 'ios') await NativeRuntime.prepareRuntime();
      ensureActive(signal);
      if (this.closing) throw cancelledError();

      if (!NativeRuntime.acquire(owner))
        throw invalid(
          'Another realtime manager owns the media engine, or the app is in the background',
        );

      this.owner = owner;
      this.engine = await this.vendor.createRTCEngine({
        appID: '69a177e226e9b90176a86b96',
      });
      ensureActive(signal);

      const engine = this.requireEngine();
      const emit = (event: RtcEvent) => {
        if (this.owner === owner && this.active) this.emit(event);
      };

      check(
        engine.setRtcVideoEventHandler({
          onSysStats: stats => {
            if (this.owner === owner && this.active)
              RtcStatsLogger.system(stats, this.runtime.platform);
          },
          onFirstLocalVideoFrameCaptured: index => {
            if (index === StreamIndex.STREAM_INDEX_MAIN)
              emit({ type: 'localFrame' });
          },
          onFirstRemoteVideoFrameDecoded: (key, info) => {
            if (key.streamIndex === StreamIndex.STREAM_INDEX_MAIN)
              emit({
                type: 'decoded',
                stream: remote(key),
                width: info.width,
                height: info.height,
              });
          },
          onFirstRemoteVideoFrameRendered: (key, info) => {
            if (key.streamIndex === StreamIndex.STREAM_INDEX_MAIN)
              emit({
                type: 'rendered',
                stream: remote(key),
                width: info.width,
                height: info.height,
              });
          },
          onSEIMessageReceived: (key, message) => {
            if (key.streamIndex !== StreamIndex.STREAM_INDEX_MAIN) return;

            // Task identifiers are ASCII. Arbitrary media payloads never cross this adapter.
            const bytes = new Uint8Array(message);

            if (bytes.length > 256 || bytes.some(value => value > 127)) return;

            emit({
              type: 'sei',
              stream: remote(key),
              message: String.fromCharCode(...bytes).trim(),
            });
          },
          onError: code => {
            XmaxLogger.rtc.error(() => `RTC engine error: ${code}`);
            emit({
              type: 'error',
              scope: 'all',
              error: new XmaxError({
                code: XmaxErrorCode.rtcError,
                message: `RTC engine error (${code})`,
              }),
            });
          },
          onPerformanceAlarms: (_mode, roomID, reason, data) => {
            if (this.connection && this.connection.roomID !== roomID) return;

            emit({
              type: 'performance',
              alarm: {
                status: [0, 3, 6].includes(reason)
                  ? RealtimePerformanceStatus.recovered
                  : RealtimePerformanceStatus.limited,
                suggestedVideoFormat:
                  data.width > 0 && data.height > 0 && data.frameRate > 0
                    ? {
                        width: data.width,
                        height: data.height,
                        fps: data.frameRate,
                      }
                    : null,
              },
            });
          },
        }),
        'Register RTC events',
      );
      if (
        Platform.OS === 'android' &&
        !NativeRuntime.adaptRtcVideoEvents(owner)
      )
        throw new XmaxError({
          code: XmaxErrorCode.rtcError,
          message: 'Unable to adapt RTC events',
        });
    })();

    try {
      await this.creating;
    } finally {
      this.creating = null;
    }
  }

  async startCamera(
    format: RealtimeVideoFormat,
    position: CameraPosition,
    signal: AbortSignal,
  ): Promise<void> {
    const engine = this.requireEngine();

    // Match iOS capture: normalize camera pixels before encoding, rather than
    // requiring downstream consumers to apply rotation metadata. External image
    // frames are already upright and must not pass through this transform.
    check(
      engine.setVideoOrientation(
        format.height > format.width
          ? VideoOrientation.PORTRAIT
          : VideoOrientation.LANDSCAPE,
      ),
      'Configure camera orientation',
    );
    check(
      engine.setVideoCaptureConfig(
        new VideoCaptureConfig(format.width, format.height, format.fps),
      ),
      'Configure camera',
    );
    await this.switchCamera(position);
    ensureActive(signal);

    const ready = waitFor<void>(
      (resolve, reject) => {
        const off = this.onEvent(event => {
          if (event.type === 'localFrame') resolve();
          else if (event.type === 'error') reject(event.error);
        });

        try {
          check(engine.startVideoCapture(), 'Start camera');
        } catch (error) {
          reject(error);
        }

        return off;
      },
      signal,
      15000,
      'Camera preview',
    );

    await ready;
    XmaxLogger.media.info(
      () =>
        `Camera preview ready: ${position}, ${format.width} × ${format.height}, ${format.fps} fps`,
    );
  }

  /** Starts upright image frames on the native worker at the requested frame rate. */
  async startImage(
    filePath: string,
    format: RealtimeVideoFormat,
  ): Promise<void> {
    const engine = this.requireEngine();
    const owner = this.owner!;

    await NativeRuntime.startImageVideo(
      owner,
      filePath,
      format.width,
      format.height,
      format.fps,
      Platform.OS === 'ios' ? rtcEngineInstanceID(engine) : '',
    );
    if (this.owner !== owner || !this.active) throw cancelledError();
    XmaxLogger.media.info(
      () =>
        `Image frame delivery started: ${format.width} × ${format.height}, ${format.fps} fps`,
    );
  }

  /** Selects external pixels before encoder setup, without internal capture transforms. */
  configureImageSource(): void {
    if (this.room)
      throw invalid('Configure the image source before joining a room');

    const engine = this.requireEngine();

    check(engine.stopVideoCapture(), 'Stop internal video capture');
    check(
      engine.setVideoSourceType(
        StreamIndex.STREAM_INDEX_MAIN,
        VideoSourceType.VIDEO_SOURCE_TYPE_EXTERNAL,
      ),
      'Configure external image source',
    );
    this.imageSource = true;
  }

  /** Attaches generation identity to native image frames before the start command is sent. */
  beginImageTask(taskID: string): void {
    if (!this.imageSource) return;

    this.requireEngine();
    if (!NativeRuntime.setImageVideoTask(this.owner!, taskID))
      throw cancelledError();
    this.imageTaskID = taskID;
  }

  /** A late cancellation may only clear its own image task. */
  endImageTask(taskID: string): void {
    if (this.imageTaskID !== taskID) return;

    this.imageTaskID = null;
    if (this.owner) NativeRuntime.setImageVideoTask(this.owner, '');
  }

  async configureEncoding(
    format: RealtimeVideoFormat,
    minBitrate: number,
    maxBitrate: number,
  ): Promise<void> {
    // RTC 1.3.2's runtime requires its native-backed class despite IEngine's plain-object declaration.
    const config = new VideoEncoderConfig();

    config.width = format.width;
    config.height = format.height;
    config.frameRate = format.fps;
    config.minBitrate = minBitrate;
    config.maxBitrate = maxBitrate;
    const preference =
      format.encoderPreference ===
      RealtimeVideoEncoderPreference.maintainFramerate
        ? RTCVideoEncoderPreference.MAINTAIN_FRAMERATE
        : format.encoderPreference ===
          RealtimeVideoEncoderPreference.maintainQuality
        ? RTCVideoEncoderPreference.MAINTAIN_QUALITY
        : RTCVideoEncoderPreference.BALANCE;
    // The pinned native-backed config exposes separate platform properties.
    if (Platform.OS === 'android')
      config.android_encodePreference =
        t_RTCVideoEncoderPreference.ts_to_android(preference);
    else
      config.ios_encoderPreference =
        t_RTCVideoEncoderPreference.ts_to_ios(preference);
    check(
      // Android helper returns a Promise; iOS returns a number. Await normalizes both.
      await this.requireEngine().setVideoEncoderConfig([config]),
      'Configure video encoder',
    );
  }

  async switchCamera(position: CameraPosition): Promise<void> {
    const engine = this.requireEngine();

    check(
      engine.switchCamera(
        position === CameraPosition.front
          ? CameraId.CAMERA_ID_FRONT
          : CameraId.CAMERA_ID_BACK,
      ),
      'Switch camera',
    );

    // Temporary workaround for the reported rear-camera inversion with the
    // pinned iOS RTC SDK on iOS 27. Reset on every switch so front capture does
    // not inherit the correction; do not extend it to unverified OS versions.
    const compensateRearCamera =
      Platform.OS === 'ios' &&
      Number(this.runtime.os_version.split('.')[0]) === 27 &&
      position === CameraPosition.back;

    check(
      await this.requireEngine().setVideoCaptureRotation(
        compensateRearCamera
          ? VideoRotation.VIDEO_ROTATION_180
          : VideoRotation.VIDEO_ROTATION_0,
      ),
      'Set camera rotation',
    );
    check(
      await this.requireEngine().setLocalVideoMirrorType(
        // Match iOS: keep the front preview and the published pixels in the same orientation.
        position === CameraPosition.front
          ? MirrorType.MIRROR_TYPE_RENDER_AND_ENCODER
          : MirrorType.MIRROR_TYPE_NONE,
      ),
      'Set camera mirror',
    );
  }

  async join(
    connection: RealtimeSessionConnection,
    microphone: boolean,
    signal: AbortSignal,
  ): Promise<void> {
    ensureActive(signal);

    const engine = this.requireEngine();

    if (this.room) throw invalid('Leave the current room first');

    const room = engine.createRTCRoom(connection.roomID);

    this.room = room;
    this.connection = connection;

    await waitFor<void>(
      (resolve, reject) => {
        const current = () =>
          this.room === room && this.active && !signal.aborted;

        check(
          room.setRTCRoomEventHandler({
            onRoomStateChanged: (id, userID, state) => {
              if (
                !current() ||
                id !== connection.roomID ||
                userID !== connection.userID
              )
                return;
              if (state === 0) resolve();
              else if (state < 0) {
                XmaxLogger.room.error(() => `Room state error: ${state}`);
                const error = new XmaxError({
                  code: XmaxErrorCode.rtcError,
                  message: `RTC room error (${state})`,
                });

                reject(error);
                this.emit({ type: 'error', error });
              }
            },
            onUserPublishStreamVideo: (id, userID, published) => {
              if (
                !current() ||
                id !== connection.roomID ||
                (connection.botName && userID !== connection.botName)
              )
                return;

              try {
                check(
                  room.subscribeStreamVideo(userID, published),
                  'Subscribe remote video',
                );
              } catch (error) {
                this.emit({ type: 'error', error: XmaxError.from(error) });
              }
            },
            onUserPublishStreamAudio: (id, userID, published) => {
              if (
                !current() ||
                id !== connection.roomID ||
                (connection.botName && userID !== connection.botName)
              )
                return;

              try {
                check(
                  room.subscribeStreamAudio(userID, published),
                  'Subscribe remote audio',
                );
              } catch (error) {
                this.emit({ type: 'error', error: XmaxError.from(error) });
              }
            },
            onLocalStreamStats: stats => {
              if (current()) RtcStatsLogger.local(stats);
            },
            onRemoteStreamStats: stats => {
              if (current())
                RtcStatsLogger.remote(stats, this.runtime.platform);
            },
            onNetworkQuality: (quality, remotes = []) => {
              if (current())
                RtcStatsLogger.network(quality, remotes, this.runtime.platform);
              if (current())
                this.emit({
                  type: 'quality',
                  quality: {
                    uplink:
                      qualities[quality.txQuality] ??
                      RealtimeNetworkQualityLevel.unknown,
                    downlink:
                      qualities[quality.rxQuality] ??
                      RealtimeNetworkQualityLevel.unknown,
                  },
                });
            },
            onRoomMessageSendResult: (id, error) => {
              if (!current()) return;
              const interactionMessage = this.interactionMessages.delete(id);
              // The RN wrapper exposes separate success enums for Android and iOS.
              if (
                current() &&
                error !==
                  RoomMessageSendResult.ROOM_MESSAGE_SEND_RESULT_SUCCESS &&
                error !==
                  RoomMessageSendResult.ByteRTCRoomMessageSendResultSuccess
              ) {
                if (interactionMessage) {
                  XmaxLogger.interaction.warn(
                    () => `Interaction sample delivery failed: ${error}`,
                  );
                  return;
                }
                XmaxLogger.room.error(
                  () => `Room signal delivery failed: ${error}`,
                );
                this.emit({
                  type: 'error',
                  error: new XmaxError({
                    code: XmaxErrorCode.rtcError,
                    message: `Room signal delivery failed (${error})`,
                  }),
                });
              }
            },
          }),
          'Register room events',
        );

        try {
          check(
            room.joinRoom({
              token: connection.token,
              userId: connection.userID,
              roomConfigs: {
                profile: ChannelProfile.CHANNEL_PROFILE_COMMUNICATION,
                isAutoPublishVideo: false,
                isAutoPublishAudio: false,
                isAutoSubscribeVideo: false,
                isAutoSubscribeAudio: false,
              },
            }),
            'Join RTC room',
          );
        } catch (error) {
          reject(error);
        }

        return () => {};
      },
      signal,
      20000,
      'RTC room join',
    );
    ensureActive(signal);
    check(room.publishStreamVideo(true), 'Publish local video');
    check(
      engine.setPlaybackVolume(Math.round(this.audioVolume * 100)),
      'Set remote audio volume',
    );
    if (microphone) {
      check(engine.startAudioCapture(), 'Start microphone');
      check(room.publishStreamAudio(true), 'Publish microphone');
    }
  }

  send(message: string, interaction = false): void {
    if (!this.room || !this.active) throw cancelledError();

    // Bound outstanding best-effort samples if the vendor stops returning receipts.
    if (interaction && this.interactionMessages.size >= 256) return;
    const id = this.room.sendRoomMessage(message);
    check(id, 'Send room signal');
    if (interaction) this.interactionMessages.add(id);
  }

  setRemoteAudioVolume(volume: number): void {
    this.audioVolume = volume;
    if (this.engine && this.active)
      check(
        this.engine.setPlaybackVolume(Math.round(volume * 100)),
        'Set remote volume',
      );
  }

  bind(
    viewID: string,
    stream: RemoteStream | null,
    mode: VideoContentMode,
  ): void {
    const engine = this.requireEngine();
    const canvas = {
      viewId: viewID,
      renderMode:
        mode === VideoContentMode.fit
          ? RenderMode.ByteRTCRenderModeFit
          : RenderMode.ByteRTCRenderModeHidden,
    };

    if (stream)
      check(
        engine.setRemoteVideoCanvas(
          {
            roomId: stream.roomID,
            userId: stream.userID,
            streamIndex: StreamIndex.STREAM_INDEX_MAIN,
          },
          canvas,
        ),
        'Bind remote view',
      );
    else
      check(
        engine.setLocalVideoCanvas(StreamIndex.STREAM_INDEX_MAIN, canvas),
        'Bind local view',
      );

    const key = stream ? JSON.stringify(stream) : 'local';

    if (viewID) this.views.set(key, viewID);
    else this.views.delete(key);
  }

  unbind(viewID: string, stream: RemoteStream | null): void {
    const key = stream ? JSON.stringify(stream) : 'local';

    if (this.views.get(key) !== viewID || !this.engine || !this.active) return;

    check(detachRtcCanvas(this.engine, stream), 'Unbind video view');
    this.views.delete(key);
  }

  leave(): void {
    if (this.imageTaskID) this.endImageTask(this.imageTaskID);
    this.interactionMessages.clear();
    const room = this.room;

    this.room = null;
    this.connection = null;
    if (!this.active) return;

    try {
      this.engine?.stopAudioCapture();
      if (room) {
        room.publishStreamAudio(false);
        room.publishStreamVideo(false);
        room.leaveRoom();
      }
    } finally {
      room?.destroy();
    }
  }

  /** Pauses local producers promptly without destroying resources used by an unwinding operation. */
  stopLocalCapture(): void {
    this.imageTaskID = null;
    this.imageSource = false;
    if (this.owner) NativeRuntime.stopImageVideo(this.owner);
    if (this.engine && this.active) {
      this.engine.stopVideoCapture();
      this.engine.stopAudioCapture();
    }
  }

  close(): Promise<void> {
    if (this.closing) return this.closing;
    this.stopLocalCapture();
    const closing = (async () => {
      try {
        await this.creating?.catch(() => {});
        this.leave();
      } finally {
        try {
          if (this.owner) this.vendor.destroyRTCEngine();
        } finally {
          if (this.owner) NativeRuntime.release(this.owner);

          this.owner = null;
          this.engine = null;
          this.views.clear();
          delete this.vendor.engine;
        }
      }
    })();

    this.closing = closing;

    return closing.finally(() => {
      if (this.closing === closing) this.closing = null;
    });
  }
}
