import { XmaxLogger } from '../Foundation/Logging/XmaxLogger';
import type { RtcManager, RemoteStream } from '../Foundation/RTC/RtcManager';
import type {
  RealtimeContext,
  RealtimeVideoFormat,
} from '../Service/Realtime/RealtimeTypes';
import { waitFor } from '../Foundation/Runtime/Async';
import { RoomController } from './Room/RoomController';
import { invalid } from '../Foundation/Errors/XmaxError';
import { matchesTaskSEI } from './Room/TaskConfirmation';

/**
 * Sends generation commands and waits for matching task, room and bot
 * confirmation.
 */
export class StreamController {
  constructor(
    private readonly rtc: RtcManager,
    readonly room: RoomController,
  ) {}

  async beginGeneration(
    taskID: string,
    format: RealtimeVideoFormat,
    context: RealtimeContext,
    signal: AbortSignal,
  ): Promise<RemoteStream> {
    const connection = this.room.connection;

    if (!connection) throw invalid('Connect before starting generation');

    return waitFor<RemoteStream>(
      (resolve, reject) => {
        const off = this.rtc.onEvent(event => {
          if (event.type === 'error') {
            reject(event.error);
            return;
          }
          if (
            event.type !== 'sei' ||
            event.stream.roomID !== connection.roomID ||
            (connection.botName && event.stream.userID !== connection.botName)
          )
            return;
          // Task identity excludes platform and frame-index query metadata.
          if (!matchesTaskSEI(taskID, event.message)) return;

          XmaxLogger.stream.info(
            'Generation task confirmed by matching room/bot SEI',
          );
          resolve(event.stream);
        });

        try {
          this.rtc.beginImageTask(taskID);
          this.room.send('start', taskID, format, context);
        } catch (error) {
          reject(error);
        }

        return off;
      },
      signal,
      30000,
      'Generation confirmation',
    ).catch(error => {
      this.rtc.endImageTask(taskID);
      throw error;
    });
  }

  updateGeneration(
    taskID: string,
    format: RealtimeVideoFormat,
    context: RealtimeContext,
  ): void {
    this.room.send('change_condition', taskID, format, context);
  }

  stopGeneration(taskID: string): void {
    this.rtc.endImageTask(taskID);
    if (this.room.connection) this.room.send('stop', taskID);
  }
}
