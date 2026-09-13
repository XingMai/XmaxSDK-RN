import type { ApiServicing } from '../Network/ApiService';
import { record, nonEmpty } from '../Network/ApiService';
import { XmaxError, XmaxErrorCode } from '../../Foundation/Errors/XmaxError';

/**
 * Validated room credentials and the optional generation bot identity returned
 * by a session.
 */
export interface RealtimeSessionConnection {
  readonly roomID: string;
  readonly token: string;
  readonly userID: string;
  readonly botName: string | null;
}

/**
 * A server session identifier and its validated RTC join information.
 */
export interface RealtimeSession {
  readonly id: string;
  readonly connection: RealtimeSessionConnection;
}

/**
 * Creates, heartbeats and closes server sessions using the Xmax API schema.
 */
export class RealtimeSessionService {
  constructor(private readonly api: ApiServicing) {}

  async createSession(
    model: string,
    signal?: AbortSignal,
  ): Promise<RealtimeSession> {
    const value = record(
      await this.api.request('POST', '/session', { model }, signal),
    );
    const id = nonEmpty(value?.sessionUid);
    let extra: unknown = value?.modelExtra;

    try {
      if (typeof extra === 'string') extra = JSON.parse(extra);
    } catch {
      extra = null;
    }

    const connection = record(extra);
    const roomID = nonEmpty(connection?.room_id),
      token = nonEmpty(connection?.room_token),
      userID = nonEmpty(connection?.user_id) ?? nonEmpty(value?.userUid);

    if (!id || !roomID || !token || !userID) {
      // Even malformed join data may already have allocated a billable session.
      if (id) await this.closeSession(id).catch(() => {});

      throw new XmaxError({
        code: XmaxErrorCode.sessionError,
        message: 'Session does not contain complete RTC join information',
      });
    }

    return {
      id,
      connection: {
        roomID,
        token,
        userID,
        botName: nonEmpty(connection?.bot_name),
      },
    };
  }

  async heartbeat(sessionID: string, signal?: AbortSignal): Promise<void> {
    const data = record(
      await this.api.request(
        'PUT',
        `/session/${encodeURIComponent(sessionID)}/heartbeat`,
        undefined,
        signal,
      ),
    );

    if (
      nonEmpty(data?.sessionUid) !== sessionID ||
      (nonEmpty(data?.status) && data?.status !== 'ACTIVE')
    )
      throw new XmaxError({
        code: XmaxErrorCode.sessionError,
        message: nonEmpty(data?.closeReason) ?? 'Session is no longer active',
      });
  }

  async closeSession(sessionID: string): Promise<void> {
    await this.api.request(
      'DELETE',
      `/session/${encodeURIComponent(sessionID)}`,
    );
  }
}
