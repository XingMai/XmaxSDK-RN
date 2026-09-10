import type { RtcManager } from '../../Foundation/RTC/RtcManager';
import type { RealtimeSessionConnection } from '../../Service/Realtime/RealtimeSessionService';
import type {
  RealtimeContext,
  RealtimeVideoFormat,
} from '../../Service/Realtime/RealtimeTypes';
import { repeatHeartbeat } from '../../Foundation/Runtime/Async';
import { roomEvent } from './RoomEvent';
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
    await this.rtc.join(connection, microphone, signal);
    this.connection = connection;
    this.stopHeartbeat = repeatHeartbeat(
      async () => {
        this.rtc.send(
          roomEvent('heartbeat', connection.userID, this.rtc.runtime),
        );
      },
      () => {},
    );
  }

  send(
    event: 'start' | 'change_condition' | 'stop',
    taskID: string,
    format?: RealtimeVideoFormat,
    context?: RealtimeContext,
  ): void {
    if (!this.connection) throw cancelledError();

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

  leave(): void {
    this.stopHeartbeat?.();
    this.stopHeartbeat = null;
    this.connection = null;
    this.rtc.leave();
  }
}
