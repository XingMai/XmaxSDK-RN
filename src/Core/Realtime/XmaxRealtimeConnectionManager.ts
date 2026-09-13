import type {
  RealtimeSession,
  RealtimeSessionService,
} from '../../Service/Realtime/RealtimeSessionService';
import type {
  RealtimeModel,
  RealtimeVideoFormat,
  RealtimeMediaStream,
} from '../../Service/Realtime/RealtimeTypes';
import { RenderController } from '../../Render/RenderController';
import { RoomController } from '../../Stream/Room/RoomController';
import { ensureActive, repeatHeartbeat } from '../../Foundation/Runtime/Async';

/**
 * Owns the server session, RTC connection and session heartbeat.
 *
 * Reclaims sessions that arrive after cancellation or contain unusable join
 * data.
 */
export class XmaxRealtimeConnectionManager {
  session: RealtimeSession | null = null;
  lastSessionID: string | null = null;
  remoteStream: RealtimeMediaStream | null = null;
  private stopHeartbeat: (() => void) | null = null;

  constructor(
    private readonly service: RealtimeSessionService,
    private readonly room: RoomController,
    private readonly render: RenderController,
  ) {}

  async connect(
    model: RealtimeModel,
    format: RealtimeVideoFormat,
    microphone: boolean,
    signal: AbortSignal,
    onFailure: (error: unknown) => void,
  ): Promise<RealtimeMediaStream> {
    this.lastSessionID = null;
    // POST is intentionally allowed to settle after cancellation so its session can be reclaimed.
    const session = await this.service.createSession(model);
    this.lastSessionID = session.id;

    try {
      ensureActive(signal);
      await this.room.join(session.connection, microphone, signal);
      ensureActive(signal);
      this.session = session;
      this.remoteStream = this.render.create(
        false,
        format,
        null,
        session.connection.botName
          ? {
              roomID: session.connection.roomID,
              userID: session.connection.botName,
            }
          : null,
      );
      this.stopHeartbeat = repeatHeartbeat(
        () => this.service.heartbeat(session.id),
        error => {
          if (this.session === session) onFailure(error);
        },
      );

      return this.remoteStream;
    } catch (error) {
      try {
        this.room.leave();
      } finally {
        await this.service.closeSession(session.id).catch(() => {});
      }
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    const session = this.session;

    this.session = null;
    this.remoteStream = null;
    this.stopHeartbeat?.();
    this.stopHeartbeat = null;
    this.render.invalidate(false);

    try {
      this.room.leave();
    } finally {
      if (session) await this.service.closeSession(session.id);
    }
  }
}
