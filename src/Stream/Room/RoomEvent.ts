import type {
  RealtimeContext,
  RealtimeVideoFormat,
} from '../../Service/Realtime/RealtimeTypes';
import type { RuntimeInfo } from '../../Foundation/Runtime/RuntimeInfo';

/**
 * Serializes a room command using the shared Xmax signalling schema.
 */
export function roomEvent(
  event: 'start' | 'change_condition' | 'stop' | 'heartbeat',
  userID: string,
  runtime: RuntimeInfo,
  taskID?: string,
  format?: RealtimeVideoFormat,
  context?: RealtimeContext,
): string {
  return JSON.stringify({
    event,
    user_id: userID,
    ...(taskID ? { uid: taskID } : {}),
    ...(format && context
      ? {
          params: {
            model: 'default',
            size: [format.width, format.height],
            prompt: context.prompt,
            ...(context.referencePath
              ? { ref_image_path: context.referencePath }
              : {}),
          },
        }
      : {}),
    runtime,
  });
}
