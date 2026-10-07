import type { InteractionPoint } from '../../Media/Interaction/InteractionCoordinateMapper';
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
            // Downlink limits ride only on start; updates keep the task's values.
            ...(event === 'start' ? downlinkBitrateParams(context) : {}),
          },
        }
      : {}),
    runtime,
  });
}

/** Maps context bitrate fields to the wire schema, skipping unset values. */
function downlinkBitrateParams(context: RealtimeContext): {
  min_bitrate?: number;
  max_bitrate?: number;
} {
  const params: { min_bitrate?: number; max_bitrate?: number } = {};

  if (context.minimumBitrate != null)
    params.min_bitrate = context.minimumBitrate;
  if (context.maximumBitrate != null)
    params.max_bitrate = context.maximumBitrate;

  return params;
}

/** iOS tracks payload contains model pixels and identities, without runtime or input SEI. */
export function tracksEvent(
  userID: string,
  taskID: string,
  points: readonly InteractionPoint[],
): string {
  return JSON.stringify({
    event: 'tracks',
    tracks: points.map(point => [point.x, point.y]),
    user_id: userID,
    uid: taskID,
  });
}
