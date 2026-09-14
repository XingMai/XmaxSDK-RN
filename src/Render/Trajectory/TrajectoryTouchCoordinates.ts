import type { MediaSize } from '../../Service/Realtime/RealtimeTypes';
import type { InteractionPoint } from '../../Media/Interaction/InteractionCoordinateMapper';

/**
 * Converts page coordinates into the actual overlay bounds. Child-relative
 * locationX/Y cannot be used because a hit target may have its own origin.
 * RN's synchronous bounding rect includes the root viewport/safe-area offset.
 */
export function trajectoryTouchPoint(
  touch: { pageX: number; pageY: number },
  rect: { x: number; y: number; width: number; height: number },
  viewport: MediaSize,
): InteractionPoint | null {
  if (
    ![touch.pageX, touch.pageY, rect.x, rect.y, rect.width, rect.height].every(
      Number.isFinite,
    ) ||
    rect.width <= 0 ||
    rect.height <= 0 ||
    viewport.width <= 0 ||
    viewport.height <= 0
  )
    return null;

  return {
    x: ((touch.pageX - rect.x) * viewport.width) / rect.width,
    y: ((touch.pageY - rect.y) * viewport.height) / rect.height,
  };
}
