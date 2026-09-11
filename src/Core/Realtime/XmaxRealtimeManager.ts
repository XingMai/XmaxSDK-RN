import { RtcStatsLogger } from '../../Foundation/RTC/RtcStatsLogger';
import { AppState, type NativeEventSubscription } from 'react-native';
import type { XmaxConfiguration } from '../XmaxConfiguration';
import { apiBaseURLs } from '../XmaxConfiguration';
import { RtcManager } from '../../Foundation/RTC/RtcManager';
import { XmaxLogger } from '../../Foundation/Logging/XmaxLogger';
import { ensureActive, waitFor } from '../../Foundation/Runtime/Async';
import { RealtimeCoordinator } from './RealtimeCoordinator';
import {
  invalid,
  XmaxError,
  XmaxErrorCode,
  XmaxErrorSeverity,
} from '../../Foundation/Errors/XmaxError';
import { ApiService } from '../../Service/Network/ApiService';
import { RealtimeSessionService } from '../../Service/Realtime/RealtimeSessionService';
import {
  RenderController,
  videoBinding,
  refreshBinding,
} from '../../Render/RenderController';
import { MediaController } from '../../Media/MediaController';
import { RoomController } from '../../Stream/Room/RoomController';
import { StreamController } from '../../Stream/StreamController';
import { XmaxRealtimeConnectionManager } from './XmaxRealtimeConnectionManager';
import { XmaxRealtimeGenerationManager } from './XmaxRealtimeGenerationManager';
import {
  RealtimeConnectionState,
  type CameraStreamOptions,
  type ImageStreamOptions,
  type RealtimeConfiguration,
  type RealtimeContext,
  type RealtimeMediaStream,
  type RealtimeState,
} from '../../Service/Realtime/RealtimeTypes';
import type {
  XmaxRealtimeManaging,
  RealtimeStateListener,
  RealtimeErrorListener,
  RealtimeCameraPreviewReadyListener,
  RealtimeNetworkQualityListener,
  RealtimePerformanceAlarmListener,
} from './XmaxRealtimeManaging';

/**
 * Coordinates camera/image input, connection, generation and rendering for one owner.
 *
 * Implements the public XmaxRealtimeManaging contract; this concrete class
 * is internal to the SDK.
 */
export class XmaxRealtimeManager implements XmaxRealtimeManaging {
  readonly options: Readonly<RealtimeConfiguration>;
  private readonly coordinator = new RealtimeCoordinator();
  private readonly render: RenderController;
  private readonly media: MediaController;
  private readonly connection: XmaxRealtimeConnectionManager;
  private readonly generation: XmaxRealtimeGenerationManager;
  private readonly rtc: RtcManager;
  private state: RealtimeState = Object.freeze({
    connectionState: RealtimeConnectionState.idle,
    sessionID: null,
    taskID: null,
  });
  private stateListener: RealtimeStateListener | null = null;
  private errorListener: RealtimeErrorListener | null = null;
  private cameraListener: RealtimeCameraPreviewReadyListener | null = null;
  private qualityListener: RealtimeNetworkQualityListener | null = null;
  private performanceListener: RealtimePerformanceAlarmListener | null = null;
  private lifecycle: NativeEventSubscription | null = null;
  private rtcEvents: (() => void) | null = null;
  private volume = 1;
  private closeOperation: Promise<void> | null = null;

  constructor(
    config: Readonly<Required<XmaxConfiguration>>,
    options: RealtimeConfiguration,
  ) {
    this.options = Object.freeze({ ...options });
    this.rtc = new RtcManager();
    this.render = new RenderController(this, this.rtc);
    this.media = new MediaController(this.rtc, this.render, options.model);

    const room = new RoomController(this.rtc);
    const stream = new StreamController(this.rtc, room);

    this.generation = new XmaxRealtimeGenerationManager(this.rtc, stream);
    this.connection = new XmaxRealtimeConnectionManager(
      new RealtimeSessionService(
        new ApiService(
          config.apiKey,
          apiBaseURLs[config.environment],
          this.rtc.runtime,
        ),
      ),
      room,
      this.render,
    );
  }

  get currentState(): RealtimeState {
    return this.state;
  }

  get localAudioVolume(): number {
    return 0;
  } // Camera has no local audio preview, matching iOS.

  get remoteAudioVolume(): number {
    return this.volume;
  }

  async setStateListener(
    listener: RealtimeStateListener | null,
  ): Promise<void> {
    this.stateListener = listener;
    this.notify(() => listener?.(this.state));
  }

  async setErrorListener(
    listener: RealtimeErrorListener | null,
  ): Promise<void> {
    this.errorListener = listener;
  }

  async setCameraPreviewReadyListener(
    listener: RealtimeCameraPreviewReadyListener | null,
  ): Promise<void> {
    this.cameraListener = listener;
  }

  async setNetworkQualityListener(
    listener: RealtimeNetworkQualityListener | null,
  ): Promise<void> {
    this.qualityListener = listener;
  }

  async setPerformanceAlarmListener(
    listener: RealtimePerformanceAlarmListener | null,
  ): Promise<void> {
    this.performanceListener = listener;
  }

  async setLocalAudioVolume(volume: number): Promise<void> {
    this.validateVolume(volume);
  }

  async setRemoteAudioVolume(volume: number): Promise<void> {
    this.validateVolume(volume);
    this.rtc.setRemoteAudioVolume(volume);
    this.volume = volume;
  }

  private run<T>(action: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (this.closeOperation)
      return Promise.reject(invalid('Realtime manager is closing'));

    return this.coordinator.run(action).catch(error => {
      const failure = XmaxError.from(error);
      if (failure.code !== XmaxErrorCode.cancelled)
        XmaxLogger.realtime.error(
          () => `Realtime operation failed: ${failure.code}`,
        );
      throw failure;
    });
  }

  private validateVolume(value: number): void {
    if (!Number.isFinite(value) || value < 0 || value > 1)
      throw invalid('Audio volume must be between 0 and 1');
  }

  private update(connectionState: RealtimeConnectionState): void {
    this.state = Object.freeze({
      connectionState,
      sessionID: this.connection.session?.id ?? null,
      taskID:
        connectionState === RealtimeConnectionState.generating
          ? this.generation.taskID
          : null,
    });
    XmaxLogger.realtime.info(
      () => `连接状态 (Connection State)：${connectionState}`,
    );
    this.notify(() => this.stateListener?.(this.state));
  }

  private notify(deliver: () => void): void {
    try {
      deliver();
    } catch {
      XmaxLogger.realtime.warn('Host listener threw an exception');
    }
  }

  private observe(): void {
    if (!this.lifecycle)
      this.lifecycle = AppState.addEventListener('change', state => {
        if (state === 'background')
          void this.close().catch(error =>
            this.notify(() => this.errorListener?.(XmaxError.from(error))),
          );
      });
    if (!this.rtcEvents)
      this.rtcEvents = this.rtc.onEvent(event => {
        if (event.type === 'quality')
          this.notify(() => this.qualityListener?.(event.quality));
        if (event.type === 'performance') {
          RtcStatsLogger.alarm(event.alarm);
          this.notify(() => this.performanceListener?.(event.alarm));
        }
        if (
          event.type === 'error' &&
          [
            RealtimeConnectionState.connected,
            RealtimeConnectionState.generating,
          ].includes(this.state.connectionState)
        )
          this.fail(event.error);
      });
  }

  private fail(error: unknown): void {
    XmaxLogger.realtime.error(
      () => `Realtime failed: ${XmaxError.from(error).code}`,
    );
    void this.coordinator
      .interrupt(async () => {
        this.update(RealtimeConnectionState.disconnecting);
        await this.disconnectInternal().catch(() => {});
        // Commit failure inside the operation gate; an old callback cannot overwrite a new connection.
        if (this.closeOperation)
          this.update(RealtimeConnectionState.disconnected);
        else {
          this.update(RealtimeConnectionState.error);
          this.notify(() => this.errorListener?.(XmaxError.from(error)));
        }
      })
      .catch(() => {});
  }

  createLocalCameraStream(
    options: CameraStreamOptions = {},
  ): Promise<RealtimeMediaStream> {
    this.observe();

    return this.run(async signal => {
      if (this.connection.session)
        throw invalid('Disconnect before changing the local input');

      const stream = await this.media.createCamera(options, signal);

      await this.setRemoteAudioVolume(0);
      this.notify(() => this.cameraListener?.());

      return stream;
    }).catch(error => {
      throw XmaxError.from(error);
    });
  }

  createLocalImageStream(
    options: ImageStreamOptions,
  ): Promise<RealtimeMediaStream> {
    this.observe();

    return this.run(async signal => {
      if (this.connection.session)
        throw invalid('Disconnect before changing the local input');

      const stream = await this.media.createImage(options, signal);

      await this.setRemoteAudioVolume(1);

      return stream;
    });
  }

  connect({
    localStream,
  }: {
    localStream: RealtimeMediaStream;
  }): Promise<RealtimeMediaStream> {
    return this.run(signal => this.connectInternal(localStream, signal));
  }

  private async connectInternal(
    localStream: RealtimeMediaStream,
    signal: AbortSignal,
  ): Promise<RealtimeMediaStream> {
    const binding = this.render.requireLocal(localStream);

    if (this.connection.remoteStream) return this.connection.remoteStream;

    this.update(RealtimeConnectionState.connecting);

    try {
      const stream = await this.connection.connect(
        this.options.model,
        binding.format,
        this.media.useMicrophone,
        signal,
        error => this.fail(error),
      );

      ensureActive(signal);
      this.update(RealtimeConnectionState.connected);

      return stream;
    } catch (error) {
      if (!signal.aborted) this.update(RealtimeConnectionState.error);

      throw XmaxError.from(error);
    }
  }

  startGeneration(options: {
    localStream: RealtimeMediaStream;
    context?: RealtimeContext | null;
  }): Promise<RealtimeMediaStream>;

  startGeneration(options?: {
    context?: RealtimeContext | null;
  }): Promise<void>;

  startGeneration(
    options: {
      localStream?: RealtimeMediaStream;
      context?: RealtimeContext | null;
    } = {},
  ): Promise<RealtimeMediaStream | void> {
    return this.run(async signal => {
      const local = options.localStream ?? this.media.stream;

      if (!local) throw invalid('Create a local media stream first');

      this.render.requireLocal(local);

      let remoteStream = this.connection.remoteStream;

      if (!remoteStream) {
        if (!options.localStream)
          throw invalid(
            'Connect before starting generation without a localStream',
          );

        remoteStream = await this.connectInternal(local, signal);
      }

      const updating =
        this.state.connectionState === RealtimeConnectionState.generating;

      try {
        const format = this.render.requireLocal(local).format;
        const remote = await this.generation.start(
          format,
          options.context,
          signal,
        );

        ensureActive(signal);
        if (remote && remoteStream.videoTrack) {
          const binding = videoBinding(remoteStream.videoTrack);

          if (binding) {
            binding.remote = remote;
            binding.confirmed = true;
            refreshBinding(binding);
          }
        }

        this.update(RealtimeConnectionState.generating);
        if (options.localStream) return remoteStream;
      } catch (error) {
        if (updating && !signal.aborted) {
          const failure = XmaxError.from(error);

          throw new XmaxError({
            code: failure.code,
            message: failure.message,
            severity: XmaxErrorSeverity.recoverable,
            apiCode: failure.apiCode,
            httpStatus: failure.httpStatus,
          });
        }
        if (!signal.aborted) {
          await this.disconnectInternal().catch(() => {});
          this.update(RealtimeConnectionState.error);
        }

        throw XmaxError.from(error);
      }
    });
  }

  switchCamera(): Promise<RealtimeMediaStream> {
    return this.run(async signal => {
      if (this.media.source !== 'camera')
        throw invalid('Create a local camera stream first');
      try {
        const generating = this.generation.taskID !== null;

        if (generating) {
          const binding = videoBinding(
            this.connection.remoteStream?.videoTrack,
          );

          if (binding) {
            binding.confirmed = false;
            refreshBinding(binding);
          }

          this.generation.stop();
          this.update(RealtimeConnectionState.connected);
        }

        const local = await this.media.switchCamera(signal);

        ensureActive(signal);
        if (generating) {
          // Match iOS: let the new camera settle before starting a fresh task.
          await waitFor<void>(
            resolve => {
              const timer = setTimeout(resolve, 500);

              return () => clearTimeout(timer);
            },
            signal,
            1000,
            'Camera switch',
          );

          const remote = await this.generation.start(
            this.render.requireLocal(local).format,
            null,
            signal,
          );
          const track = this.connection.remoteStream?.videoTrack;

          if (remote && track) {
            const binding = videoBinding(track);

            if (binding) {
              binding.remote = remote;
              binding.confirmed = true;
              refreshBinding(binding);
            }
          }

          ensureActive(signal);
          this.update(RealtimeConnectionState.generating);
        }

        return local;
      } catch (error) {
        if (!signal.aborted) {
          await this.disconnectInternal().catch(() => {});
          this.update(RealtimeConnectionState.error);
        }

        throw error;
      }
    });
  }

  private async disconnectInternal(): Promise<void> {
    try {
      this.generation.reset();
    } finally {
      await this.connection.disconnect();
    }
  }

  disconnect(): Promise<void> {
    return this.coordinator.interrupt(async () => {
      this.update(RealtimeConnectionState.disconnecting);

      try {
        await this.disconnectInternal();
      } finally {
        this.update(RealtimeConnectionState.disconnected);
      }
    });
  }

  stopLocalCameraStream(): Promise<void> {
    return this.stopLocal('camera');
  }

  stopLocalImageStream(): Promise<void> {
    return this.stopLocal('image');
  }

  private stopLocal(source: 'camera' | 'image'): Promise<void> {
    return this.run(async () => {
      if (this.connection.session)
        throw invalid('Disconnect before stopping the local input');

      await this.media.stop(source);
    });
  }

  close(): Promise<void> {
    if (this.closeOperation) return this.closeOperation;

    const operation = (async () => {
      // Send stop before detaching the room. Release local capture immediately, including while POST settles.
      try {
        this.generation.reset();
      } catch {
        /* Connection cleanup still owns server deletion. */
      }

      const disconnecting = this.disconnect();
      const mediaClose = this.media.close();

      try {
        const outcomes = await Promise.allSettled([disconnecting, mediaClose]);
        const failure = outcomes.find(result => result.status === 'rejected');

        if (failure?.status === 'rejected')
          throw XmaxError.from(failure.reason);
      } finally {
        this.render.invalidate();
        this.lifecycle?.remove();
        this.lifecycle = null;
        this.rtcEvents?.();
        this.rtcEvents = null;
      }
    })();

    this.closeOperation = operation;

    return operation.finally(() => {
      if (this.closeOperation === operation) this.closeOperation = null;
    });
  }
}
