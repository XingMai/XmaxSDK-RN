import { XmaxError, XmaxErrorCode } from '../Errors/XmaxError';

/** Resolves the pinned RN RTC wrapper's native identity without creating another engine. */
export function rtcEngineInstanceID(engine: unknown): string {
  const instance = (
    engine as {
      _instance?: { instanceId?: unknown; _instanceId?: unknown };
    }
  )?._instance;
  const id = instance?.instanceId ?? instance?._instanceId;

  if (typeof id !== 'string' || !id)
    throw new XmaxError({
      code: XmaxErrorCode.rtcError,
      message: 'RTC engine native reference is unavailable',
    });

  return id;
}
