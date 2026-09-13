import { InteractionController } from '../../Media/Interaction/InteractionController';
import { RtcStatsLogger } from '../../Foundation/RTC/RtcStatsLogger';
import { AppState, type NativeEventSubscription } from 'react-native';
import type { XmaxConfiguration } from '../XmaxConfiguration';
import { apiBaseURLs } from '../XmaxConfiguration';
import { RtcManager } from '../../Foundation/RTC/RtcManager';
import { XmaxLogger } from '../../Foundation/Logging/XmaxLogger';
import { ensureActive, waitFor } from '../../Foundation/Runtime/Async';
import {
  RealtimeCoordinator,
  type RealtimeOperation,
  type TerminationScope,
} from './RealtimeCoordinator';
import { invalid, XmaxError } from '../../Foundation/Errors/XmaxError';
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
  type RealtimeReason,
} from '../../Service/Realtime/RealtimeTypes';
import type {
  XmaxRealtimeManaging,
  RealtimeStateListener,
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
  private readonly coordinator: RealtimeCoordinator;
  private readonly render: RenderController;
  private readonly media: MediaController;
  private readonly connection: XmaxRealtimeConnectionManager;
  private readonly generation: XmaxRealtimeGenerationManager;
  private readonly rtc: RtcManager;
  private readonly interaction: InteractionController;
  private qualityListener: RealtimeNetworkQualityListener | null = null;
  private performanceListener: RealtimePerformanceAlarmListener | null = null;
  private lifecycle: NativeEventSubscription | null = null;
  private rtcEvents: (() => void) | null = null;
  private volume = 1;
  private disconnectCleanup: Promise<void> | null = null;

  constructor(
    config: Readonly<Required<XmaxConfiguration>>,
    options: RealtimeConfiguration,
  ) {
    this.options = Object.freeze({ ...options });
    this.rtc = new RtcManager();
    const room = new RoomController(this.rtc);
    this.interaction = new InteractionController((taskID, points) =>
      room.sendTracks(taskID, points),
    );
    this.coordinator = new RealtimeCoordinator(
      scope => this.cleanup(scope),
      () => this.media.stream !== null,
      () => this.connection.lastSessionID,
    );
    this.render = new RenderController(
      this,
      this.rtc,
      this.interaction,
      binding => {
        if (
          binding.valid &&
          binding === videoBinding(this.media.stream?.videoTrack)
        )
          this.coordinator.localPreviewDidBecomeReady();
      },
      (binding, error) => {
        if (binding.valid)
          this.fail(error, binding.local ? 'all' : 'connection');
      },
    );
    this.media = new MediaController(this.rtc, this.render, options.model);

    const stream = new StreamController(this.rtc, room);

    this.generation = new XmaxRealtimeGenerationManager(
      this.rtc,
      stream,
      this.interaction,
    );
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
    return this.coordinator.currentState;
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
    this.coordinator.setStateListener(listener);
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

  private validateVolume(value: number): void {
    if (!Number.isFinite(value) || value < 0 || value > 1)
      throw invalid('Audio volume must be between 0 and 1');
  }

  private update(
    connectionState: RealtimeConnectionState,
    token: RealtimeOperation,
  ): void {
    this.coordinator.commit(
      {
        connectionState,
        sessionID: this.connection.session?.id ?? null,
        taskID:
          connectionState === RealtimeConnectionState.generating
            ? this.generation.taskID
            : null,
        reason: null,
      },
      token,
    );
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
        if (state === 'background') void this.close();
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
          this.currentState.connectionState !== RealtimeConnectionState.idle &&
          (event.scope === 'all' ||
            this.currentState.connectionState !==
              RealtimeConnectionState.disconnecting)
        )
          this.fail(event.error, event.scope ?? 'connection');
      });
  }

  private fail(error: unknown, scope: TerminationScope = 'connection'): void {
    this.interaction.stopInteraction();
    void this.coordinator.terminate(scope, {
      type: 'failure',
      error: XmaxError.from(error),
    });
  }

  createLocalCameraStream(
    options: CameraStreamOptions = {},
  ): Promise<RealtimeMediaStream> {
    return this.createLocal('camera', token =>
      this.media.createCamera(options, token.signal),
    );
  }

  createLocalImageStream(
    options: ImageStreamOptions,
  ): Promise<RealtimeMediaStream> {
    return this.createLocal('image', token =>
      this.media.createImage(options, token.signal),
    );
  }

  private createLocal(
    source: 'camera' | 'image',
    prepare: (token: RealtimeOperation) => Promise<RealtimeMediaStream>,
  ): Promise<RealtimeMediaStream> {
    return this.coordinator.run('media', async token => {
      if (this.connection.session)
        throw invalid('Disconnect before changing the local input');
      if (this.media.source)
        throw invalid(
          'Stop the current local stream before creating another one',
        );
      this.observe();
      this.connection.lastSessionID = null;
      this.update(RealtimeConnectionState.preparing, token);
      token.ensureCurrent();
      const stream = await prepare(token);
      token.ensureCurrent();
      token.setFailureScope('all');
      await this.setRemoteAudioVolume(source === 'camera' ? 0 : 1);
      token.ensureCurrent();
      if (source === 'image') this.update(RealtimeConnectionState.ready, token);
      return stream;
    });
  }

  connect({
    localStream,
  }: {
    localStream: RealtimeMediaStream;
  }): Promise<RealtimeMediaStream> {
    return this.coordinator.run('connection', token =>
      this.connectInternal(localStream, token),
    );
  }

  private async connectInternal(
    localStream: RealtimeMediaStream,
    token: RealtimeOperation,
  ): Promise<RealtimeMediaStream> {
    const binding = this.render.requireLocal(localStream);
    if (this.connection.remoteStream) return this.connection.remoteStream;
    token.setFailureScope('connection');
    this.connection.lastSessionID = null;
    this.update(RealtimeConnectionState.connecting, token);
    token.ensureCurrent();
    const stream = await this.connection.connect(
      this.options.model,
      binding.format,
      this.media.useMicrophone,
      token.signal,
      error => this.fail(error),
    );
    this.update(RealtimeConnectionState.connected, token);
    return stream;
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
    return this.coordinator.run('generation', async token => {
      const { signal } = token;
      const local = options.localStream ?? this.media.stream;

      if (!local) throw invalid('Create a local media stream first');

      this.render.requireLocal(local);
      this.generation.validateContext(options.context);

      let remoteStream = this.connection.remoteStream;

      if (!remoteStream) {
        if (!options.localStream)
          throw invalid(
            'Connect before starting generation without a localStream',
          );

        remoteStream = await this.connectInternal(local, token);
      }

      const updating =
        this.currentState.connectionState ===
        RealtimeConnectionState.generating;

      if (!updating) token.setFailureScope('connection');
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

      this.update(RealtimeConnectionState.generating, token);
      if (options.localStream) return remoteStream;
    });
  }

  switchCamera(): Promise<RealtimeMediaStream> {
    return this.coordinator.run('cameraSwitch', async token => {
      const { signal } = token;
      if (this.media.source !== 'camera')
        throw invalid('Create a local camera stream first');
      const generating = this.generation.taskID !== null;
      if (generating) token.setFailureScope('connection');

      if (generating) {
        const binding = videoBinding(this.connection.remoteStream?.videoTrack);

        if (binding) {
          binding.confirmed = false;
          refreshBinding(binding);
        }

        this.generation.stop();
        this.update(RealtimeConnectionState.connected, token);
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
        this.update(RealtimeConnectionState.generating, token);
      }

      return local;
    });
  }

  /** Coalesces connection cleanup when a concurrent close expands its scope. */
  private disconnectInternal(): Promise<void> {
    if (this.disconnectCleanup) return this.disconnectCleanup;
    const cleanup = (async () => {
      await this.render.hideRemote();
      try {
        this.generation.reset();
      } finally {
        await this.connection.disconnect();
      }
    })();
    const completion = cleanup.finally(() => {
      if (this.disconnectCleanup === completion) this.disconnectCleanup = null;
    });
    this.disconnectCleanup = completion;
    return completion;
  }

  disconnect(options?: { reason?: RealtimeReason }): Promise<void> {
    return this.coordinator.disconnect(options?.reason);
  }

  stopLocalCameraStream(): Promise<void> {
    return this.stopLocal('camera');
  }

  stopLocalImageStream(): Promise<void> {
    return this.stopLocal('image');
  }

  private stopLocal(source: 'camera' | 'image'): Promise<void> {
    return this.coordinator.run('media', async token => {
      if (this.connection.session)
        throw invalid('Disconnect before stopping the local input');

      token.setFailureScope('all');
      await this.media.stop(source);
      this.update(
        this.media.stream
          ? RealtimeConnectionState.ready
          : RealtimeConnectionState.idle,
        token,
      );
    });
  }

  close(): Promise<void> {
    return this.coordinator.terminate('all');
  }

  /** Releases capture immediately while a cancelled session allocation settles. */
  private async cleanup(scope: TerminationScope): Promise<void> {
    if (scope === 'connection') return this.disconnectInternal();
    // Stop signalling after the remote layer is hidden, before closing the shared RTC engine.
    let stopFailure: unknown;
    try {
      await this.render.hideRemote();
      this.generation.reset();
    } catch (error) {
      stopFailure = error;
    }
    try {
      const results = await Promise.allSettled([
        this.disconnectInternal(),
        this.media.close(),
      ]);
      const failure = results.find(result => result.status === 'rejected');
      if (failure?.status === 'rejected') throw failure.reason;
      if (stopFailure) throw stopFailure;
    } finally {
      this.render.invalidate();
      this.lifecycle?.remove();
      this.lifecycle = null;
      this.rtcEvents?.();
      this.rtcEvents = null;
    }
  }
}
