import NativeRuntime from '../Native/NativeXmaxRuntime';
import { invalid, XmaxError, XmaxErrorCode } from '../Errors/XmaxError';
import type { MediaSize } from '../../Service/Realtime/RealtimeTypes';

/** Decodes image metadata and prepares private files without exposing pixels to JS. */
export class ImageManager {
  async size(fileURL: string): Promise<MediaSize> {
    if (
      typeof fileURL !== 'string' ||
      !fileURL.trim() ||
      !/^(file:\/\/\/|content:\/\/|\/)/.test(fileURL)
    )
      throw invalid('A readable local image fileURL is required');

    try {
      const size = JSON.parse(
        await NativeRuntime.imageInfo(fileURL),
      ) as MediaSize;

      if (
        ![size.width, size.height].every(n => Number.isSafeInteger(n) && n > 0)
      )
        throw new Error('Invalid image dimensions');

      return size;
    } catch (error) {
      throw this.failure(error);
    }
  }

  async prepare(fileURL: string, size: MediaSize): Promise<string> {
    try {
      const prepared = await NativeRuntime.prepareImage(
        fileURL,
        size.width,
        size.height,
      );

      if (!prepared.startsWith('file:///'))
        throw new Error(
          'Native image preparation returned an invalid file URL',
        );

      return prepared;
    } catch (error) {
      throw this.failure(error);
    }
  }

  async remove(fileURL: string): Promise<void> {
    await NativeRuntime.removePreparedImage(fileURL);
  }

  private failure(error: unknown): XmaxError {
    return new XmaxError({
      code: XmaxErrorCode.mediaError,
      message:
        error instanceof Error ? error.message : 'Unable to prepare image',
    });
  }
}
