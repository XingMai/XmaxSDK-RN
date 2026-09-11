import {
  VideoContentMode,
  type MediaSize,
} from '../../Service/Realtime/RealtimeTypes';

/** A point in viewport units or model pixels, depending on the enclosing frame. */
export interface InteractionPoint {
  readonly x: number;
  readonly y: number;
}

/** One simultaneous sample; coordinates are relative to the video container. */
export interface InteractionFrame {
  readonly points: readonly InteractionPoint[];
  readonly viewportSize: MediaSize;
  readonly contentMode: VideoContentMode;
  /** Rejects samples whose touch owner was cancelled before delivery. */
  readonly isCurrent?: () => boolean;
}

/** The centered video rectangle, including cropped pixels outside a fill viewport. */
export function displayedFrame(
  viewport: MediaSize,
  video: MediaSize,
  mode: VideoContentMode,
) {
  if (
    ![viewport.width, viewport.height, video.width, video.height].every(
      value => Number.isFinite(value) && value > 0,
    )
  )
    return null;

  const scale = (mode === VideoContentMode.fill ? Math.max : Math.min)(
    viewport.width / video.width,
    viewport.height / video.height,
  );
  const width = video.width * scale,
    height = video.height * scale;

  return {
    x: (viewport.width - width) / 2,
    y: (viewport.height - height) / 2,
    width,
    height,
  };
}

/** Matches iOS rounding/clamping; fit black bars never produce model coordinates. */
export function mapInteractionPoint(
  point: InteractionPoint,
  viewport: MediaSize,
  video: MediaSize,
  mode: VideoContentMode,
): InteractionPoint | null {
  const frame = displayedFrame(viewport, video, mode);

  if (!frame || !Number.isFinite(point.x) || !Number.isFinite(point.y))
    return null;
  if (
    mode === VideoContentMode.fit &&
    (point.x < frame.x ||
      point.y < frame.y ||
      point.x > frame.x + frame.width ||
      point.y > frame.y + frame.height)
  )
    return null;

  return {
    x: Math.min(
      video.width - 1,
      Math.max(
        0,
        Math.round(((point.x - frame.x) / frame.width) * video.width),
      ),
    ),
    y: Math.min(
      video.height - 1,
      Math.max(
        0,
        Math.round(((point.y - frame.y) / frame.height) * video.height),
      ),
    ),
  };
}
