import { PermissionsAndroid, Platform } from 'react-native';
import {
  RTCManager as VendorRTCManager,
  CameraId,
  MirrorType,
  StreamIndex,
  RenderMode,
  ChannelProfile,
  VideoCaptureConfig,
  VideoEncoderConfig,
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
  | { type: 'error'; error: XmaxError }
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
  if (status !== undefined && status < 0)
    throw new XmaxError({
      code: XmaxErrorCode.rtcError,
      message: `${action} failed (${status})`,
    });
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
  private readonly views = new Map<string, string>();
  readonly runtime: RuntimeInfo;

  constructor() {
    this.runtime = {
      ...(JSON.parse(NativeRuntime.runtimeInfo()) as Omit<
        RuntimeInfo,
        'sdk_version'
      >),
      sdk_version: '0.0.1',
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

    if (!NativeRuntime.acquire(owner))
      throw invalid(
        'Another realtime manager owns the media engine, or the app is in the background',
      );

    this.owner = owner;
    this.creating = (async () => {
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
          onError: code =>
            emit({
              type: 'error',
              error: new XmaxError({
                code: XmaxErrorCode.rtcError,
                message: `RTC engine error (${code})`,
              }),
            }),
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
  }

  /** Enables the vendor's internal static-image source without opening the camera. */
  startImage(filePath: string): void {
    const engine = this.requireEngine();

    check(engine.setDummyCaptureImagePath(filePath), 'Set image source');
    check(engine.stopVideoCapture(), 'Start static image video');
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
    check(
      await this.requireEngine().setLocalVideoMirrorType(
        position === CameraPosition.front
          ? MirrorType.MIRROR_TYPE_RENDER
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
            onNetworkQuality: quality => {
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
            onRoomMessageSendResult: (_id, error) => {
              if (current() && error !== 0)
                this.emit({
                  type: 'error',
                  error: new XmaxError({
                    code: XmaxErrorCode.rtcError,
                    message: `Room signal delivery failed (${error})`,
                  }),
                });
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

  send(message: string): void {
    if (!this.room || !this.active) throw cancelledError();

    check(this.room.sendRoomMessage(message), 'Send room signal');
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

    if (this.views.get(key) === viewID && this.engine && this.active)
      this.bind('', stream, VideoContentMode.fill);
  }

  leave(): void {
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

  close(): Promise<void> {
    if (this.closing) return this.closing;
    if (this.engine && this.active) {
      this.engine.setDummyCaptureImagePath('');
      this.engine.stopVideoCapture();
      this.engine.stopAudioCapture();
    }

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
