import { invalid } from '../../Foundation/Errors/XmaxError';
import {
  RealtimeModel,
  realtimeModelSpecifications,
  type MediaSize,
} from '../Realtime/RealtimeTypes';

/**
 * Performs synchronous media calculations for a model without allocating native
 * resources.
 */
export interface MediaServicing {
  readonly model: RealtimeModel;

  /**
   * Resolves positive source dimensions to the model's supported input size.
   *
   * Empty model buckets resize using the model's pixel bounds and alignment.
   * Nonempty buckets return exact matches unchanged and
   * throw INVALID_CONFIGURATION for other sizes, before rounding or resizing.
   */
  resolveModelInputSize(size: MediaSize): MediaSize;
}

/**
 * Resolves model input sizes using synchronous TypeScript calculations.
 */
export class MediaService implements MediaServicing {
  constructor(readonly model: RealtimeModel = RealtimeModel.x2_0) {}

  resolveModelInputSize(size: MediaSize): MediaSize {
    const {
      resolutionBuckets,
      minimumInputPixels,
      maximumInputPixels,
      inputSizeAlignment,
    } = realtimeModelSpecifications[this.model];

    if (resolutionBuckets.length > 0) {
      if (
        !resolutionBuckets.some(
          supported =>
            supported.width === size.width && supported.height === size.height,
        )
      )
        throw invalid(
          `Model ${this.model} does not support input resolution ${
            size.width
          }×${size.height}. Supported resolutions: ${resolutionBuckets
            .map(supported => `${supported.width}×${supported.height}`)
            .join(', ')}`,
        );

      return { width: size.width, height: size.height };
    }

    if (
      ![size.width, size.height].every(
        n => Number.isFinite(n) && n > 0 && n < Number.MAX_SAFE_INTEGER,
      )
    )
      throw invalid(
        'Image width and height must be finite numbers greater than zero',
      );

    const w = Math.max(1, Math.round(size.width)),
      h = Math.max(1, Math.round(size.height));
    const pixels = w * h;
    const scale =
      pixels < minimumInputPixels
        ? Math.sqrt(minimumInputPixels / pixels)
        : pixels > maximumInputPixels
        ? Math.sqrt(maximumInputPixels / pixels)
        : 1;
    const round =
      pixels < minimumInputPixels
        ? Math.ceil
        : pixels > maximumInputPixels
        ? Math.floor
        : Math.round;
    const width = Math.max(
        inputSizeAlignment,
        round((w * scale) / inputSizeAlignment) * inputSizeAlignment,
      ),
      height = Math.max(
        inputSizeAlignment,
        round((h * scale) / inputSizeAlignment) * inputSizeAlignment,
      );

    if (
      width * height >= minimumInputPixels &&
      width * height <= maximumInputPixels
    )
      return { width, height };

    let best = { width: 0, height: 0 },
      distance = Infinity;

    const minimumUnits = Math.ceil(
      minimumInputPixels / inputSizeAlignment ** 2,
    );
    const maximumUnits = Math.floor(
      maximumInputPixels / inputSizeAlignment ** 2,
    );

    for (let wu = 1; wu <= maximumUnits; wu++) {
      const min = Math.ceil(minimumUnits / wu),
        max = Math.floor(maximumUnits / wu);

      if (min > max) continue;

      const hu = Math.min(
        max,
        Math.max(min, Math.round((h * scale) / inputSizeAlignment)),
      );
      const cw = wu * inputSizeAlignment,
        ch = hu * inputSizeAlignment;
      const d =
        ((cw - w * scale) / (w * scale)) ** 2 +
        ((ch - h * scale) / (h * scale)) ** 2;

      if (d < distance) {
        best = { width: cw, height: ch };
        distance = d;
      }
    }

    return best;
  }
}
