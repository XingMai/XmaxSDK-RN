import Blob from 'react-native-blob-util';
import type { XmaxStorageManaging } from '@xmax/react-native-sdk';

/** Copies picker bytes into an owned file for COS, then removes only that temporary copy. */
export async function uploadTouchAnimationReference(
  storage: XmaxStorageManaging,
  fileURL: string,
  contentType: string | undefined,
  signal: AbortSignal,
): Promise<string> {
  const extension =
    fileURL.split(/[?#]/)[0]?.match(/\.([a-zA-Z0-9]+)$/)?.[1] ?? 'jpg';
  const path = `${
    Blob.fs.dirs.CacheDir
  }/xlab-touch-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}.${extension}`;
  const source = fileURL.startsWith('file://')
    ? decodeURIComponent(fileURL.replace(/^file:\/\/(?:localhost)?/i, ''))
    : fileURL;

  try {
    signal.throwIfAborted();
    await Blob.fs.cp(source, path);
    signal.throwIfAborted();
    const uploaded = await storage.uploadImage({
      fileURL: `file://${path}`,
      contentType: contentType ?? null,
      signal,
    });
    signal.throwIfAborted();

    return uploaded.url;
  } finally {
    await Blob.fs.unlink(path).catch(() => {});
  }
}
