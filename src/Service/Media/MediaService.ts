import { invalid } from '../../Foundation/Errors/XmaxError';
import { RealtimeModel, type MediaSize } from '../Realtime/RealtimeTypes';
export interface MediaServicing {
  readonly model: RealtimeModel;
  resolveModelInputSize(size: MediaSize): MediaSize;
}
export class MediaService implements MediaServicing {
  constructor(readonly model: RealtimeModel = RealtimeModel.x2_0) {}
  resolveModelInputSize(size: MediaSize): MediaSize {
    if (
      ![size.width, size.height].every(
        n => Number.isFinite(n) && n > 0 && n < Number.MAX_SAFE_INTEGER,
      )
    )
      throw invalid('Image dimensions must be finite positive numbers');
    const w = Math.max(1, Math.round(size.width)),
      h = Math.max(1, Math.round(size.height));
    const pixels = w * h;
    const scale =
      pixels < 600000
        ? Math.sqrt(600000 / pixels)
        : pixels > 1280000
        ? Math.sqrt(1280000 / pixels)
        : 1;
    const round =
      pixels < 600000 ? Math.ceil : pixels > 1280000 ? Math.floor : Math.round;
    const width = Math.max(32, round((w * scale) / 32) * 32),
      height = Math.max(32, round((h * scale) / 32) * 32);
    if (width * height >= 600000 && width * height <= 1280000)
      return { width, height };
    let best = { width: 0, height: 0 },
      distance = Infinity;
    for (let wu = 1; wu <= 1250; wu++) {
      const min = Math.ceil(Math.ceil(600000 / 1024) / wu),
        max = Math.floor(1250 / wu);
      if (min > max) continue;
      const hu = Math.min(max, Math.max(min, Math.round((h * scale) / 32)));
      const cw = wu * 32,
        ch = hu * 32;
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
