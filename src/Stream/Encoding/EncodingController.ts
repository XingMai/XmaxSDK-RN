import { invalid } from '../../Foundation/Errors/XmaxError';
import type { RealtimeVideoFormat } from '../../Service/Realtime/RealtimeTypes';

const at15: readonly (readonly [number, number])[] = [
  [14400, 50],
  [19200, 65],
  [32400, 100],
  [43200, 120],
  [57600, 140],
  [76800, 200],
  [101760, 220],
  [129600, 260],
  [172800, 320],
  [230400, 400],
  [307200, 500],
  [407040, 610],
  [691200, 910],
  [921600, 1130],
  [2073600, 2080],
];

const at30: readonly (readonly [number, number])[] = [
  [129600, 400],
  [172800, 490],
  [230400, 600],
  [307200, 750],
  [407040, 930],
  [691200, 1380],
  [921600, 1710],
  [2073600, 3150],
];

function interpolate(
  value: number,
  points: readonly (readonly [number, number])[],
): number {
  const first = points[0]!;

  if (value <= first[0]) return (first[1] * value) / first[0];

  for (let i = 1; i < points.length; i++) {
    const upper = points[i]!,
      lower = points[i - 1]!;

    if (value <= upper[0])
      return (
        lower[1] +
        ((upper[1] - lower[1]) * (value - lower[0])) / (upper[0] - lower[0])
      );
  }

  const last = points[points.length - 1]!;

  return (last[1] * value) / last[0];
}

/**
 * Rejects non-integer frame rates or dimensions that are not positive even
 * integers.
 */
export function validateVideoFormat(format: RealtimeVideoFormat): void {
  if (
    ![format.width, format.height, format.fps].every(
      n => Number.isSafeInteger(n) && n > 0,
    ) ||
    format.width % 2 ||
    format.height % 2
  )
    throw invalid(
      'Video width and height must be positive even integers; fps must be a positive integer',
    );
}

/**
 * Calculates minimum and maximum encoding rates in kbps from the iOS bitrate
 * tables.
 */
export function resolveBitrates(format: RealtimeVideoFormat): {
  minimum: number;
  maximum: number;
} {
  validateVideoFormat(format);

  const pixels = format.width * format.height,
    b15 = interpolate(pixels, at15);
  const b30 =
    pixels < 129600
      ? (b15 * 400) / interpolate(129600, at15)
      : interpolate(pixels, at30);
  const minimum = Math.max(
    1,
    Math.round(
      interpolate(format.fps, [
        [10, b15 * 0.8],
        [15, b15],
        [30, b30],
        [60, (b30 * 4780) / 3150],
      ]),
    ),
  );
  const maximum = Math.max(
    minimum + 1,
    Math.round(
      interpolate(format.fps, [
        [10, b15 * 1.6],
        [15, b15 * 2],
        [30, b30 * 2],
        [60, (b30 * 6500) / 3150],
      ]),
    ),
  );

  if (!Number.isSafeInteger(maximum))
    throw invalid('Video bitrate exceeds the supported range');

  return { minimum, maximum };
}
