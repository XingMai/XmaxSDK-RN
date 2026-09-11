import type { InteractionPoint } from '../../Media/Interaction/InteractionCoordinateMapper';
import { XmaxLogger } from '../../Foundation/Logging/XmaxLogger';
import type { RtcManager } from '../../Foundation/RTC/RtcManager';
import type { RealtimeSessionConnection } from '../../Service/Realtime/RealtimeSessionService';
import type {
  RealtimeContext,
  RealtimeVideoFormat,
} from '../../Service/Realtime/RealtimeTypes';
import { repeatHeartbeat } from '../../Foundation/Runtime/Async';
import { roomEvent, tracksEvent } from './RoomEvent';
import { cancelledError } from '../../Foundation/Errors/XmaxError';

/**
 * Owns room membership, room heartbeats and generation signalling.
 */
export class RoomController {
  connection: RealtimeSessionConnection | null = null;
  private stopHeartbeat: (() => void) | null = null;

  constructor(private readonly rtc: RtcManager) {}

  async join(
    connection: RealtimeSessionConnection,
    microphone: boolean,
    signal: AbortSignal,
  ): Promise<void> {
    XmaxLogger.room.info('Joining room');
    await this.rtc.join(connection, microphone, signal);
    this.connection = connection;
    XmaxLogger.room.info('Joined room');
    this.stopHeartbeat = repeatHeartbeat(
      async () => {
        this.rtc.send(
          roomEvent('heartbeat', connection.userID, this.rtc.runtime),
        );
      },
      () => XmaxLogger.room.warn('Room heartbeat failed'),
    );
  }

  send(
    event: 'start' | 'change_condition' | 'stop',
    taskID: string,
    format?: RealtimeVideoFormat,
    context?: RealtimeContext,
  ): void {
    if (!this.connection) throw cancelledError();

    XmaxLogger.room.debug(
      () =>
        `发送信令 (Send Signal)：${event}\n` +
        `视频 (Video)：${
          format
            ? `${format.width} × ${format.height} @ ${format.fps} fps`
            : 'unchanged'
        }`,
    );
    this.rtc.send(
      roomEvent(
        event,
        this.connection.userID,
        this.rtc.runtime,
        taskID,
        format,
        context,
      ),
    );
  }

  /** Sends one sampled frame; delivery failure is recoverable and must not stop generation. */
  sendTracks(taskID: string, points: readonly InteractionPoint[]): void {
    if (!this.connection) throw cancelledError();
    this.rtc.send(tracksEvent(this.connection.userID, taskID, points), true);
  }

  leave(): void {
    if (this.connection) XmaxLogger.room.info('Leaving room');
    this.stopHeartbeat?.();
    this.stopHeartbeat = null;
    this.connection = null;
    this.rtc.leave();
  }
}
