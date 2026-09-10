import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import type { Asset } from 'react-native-image-picker';
import Blob from 'react-native-blob-util';
import { XmaxClient, type XmaxEnvironment } from '@xmax/react-native-sdk';
import type { RealtimeReference } from './RealtimeReferenceCatalog';
import {
  ReferenceUploadTask,
  type ReferenceUploadFile,
  type ReferenceUploadUpdate,
} from './ReferenceUploadTask';

/**
 * Copies a picker image to an owned file before passing its URL to COS.
 * Partial copies are removed here; completed copies belong to the task.
 */
async function prepareReferenceFile(
  id: string,
  asset: Asset,
): Promise<ReferenceUploadFile> {
  if (!asset.uri || !asset.type?.startsWith('image/'))
    throw new Error('请选择可读取的图片');

  const suffix = asset.fileName?.split('.').pop()?.toLowerCase();
  const extension = suffix && /^[a-z0-9]+$/.test(suffix) ? suffix : 'image';
  const path = `${Blob.fs.dirs.CacheDir}/xlab-reference-${id}.${extension}`;
  const source = asset.uri.startsWith('file://')
    ? decodeURIComponent(asset.uri.replace(/^file:\/\/(?:localhost)?/i, ''))
    : asset.uri;

  try {
    await Blob.fs.cp(source, path);
    const stat = await Blob.fs.stat(path);
    if (stat.type !== 'file' || Number(stat.size) <= 0)
      throw new Error('无法读取参考图文件');

    return {
      fileURL: `file://${path}`,
      contentType: asset.type,
      dispose: () => Blob.fs.unlink(path).catch(() => {}),
    };
  } catch (error) {
    await Blob.fs.unlink(path).catch(() => {});
    throw error;
  }
}

/**
 * Keeps reference uploads independent from camera operations and selection.
 * All owned tasks are cancelled when the panel leaves the screen.
 */
export function useReferenceUploads(
  apiKey: string,
  environment: XmaxEnvironment,
  onUpdate: (id: string, update: ReferenceUploadUpdate) => void,
) {
  const tasks = useRef(new Map<string, ReferenceUploadTask>());
  const mounted = useRef(true);
  const update = useRef(onUpdate);
  update.current = onUpdate;

  useEffect(() => {
    mounted.current = true;
    const ownedTasks = tasks.current;

    return () => {
      mounted.current = false;
      for (const task of ownedTasks.values()) void task.close().catch(() => {});
      ownedTasks.clear();
    };
  }, []);

  /**
   * Uses the same ordinary image-upload method as the iOS reference picker.
   */
  function start(reference: RealtimeReference, asset: Asset) {
    if (!mounted.current) return;

    const task = new ReferenceUploadTask(
      () => prepareReferenceFile(reference.id, asset),
      (file, signal) => {
        if (!apiKey.trim())
          throw new Error('请返回首页填写 API Key 后再上传。');

        const storage = new XmaxClient({
          apiKey,
          environment,
        }).createStorageManager();

        return storage.uploadImage({
          fileURL: file.fileURL,
          contentType: file.contentType,
          signal,
        });
      },
      value => {
        if (mounted.current) update.current(reference.id, value);
      },
      () => {
        if (mounted.current)
          Alert.alert(
            '参考图上传失败',
            apiKey.trim()
              ? '点击图片可重试。'
              : '请返回首页填写 API Key 后再上传。',
          );
      },
    );

    tasks.current.set(reference.id, task);
    void task.start().catch(() => {});
  }

  function retry(id: string) {
    void tasks.current
      .get(id)
      ?.start()
      .catch(() => {});
  }

  function remove(id: string) {
    const task = tasks.current.get(id);
    tasks.current.delete(id);
    void task?.close().catch(() => {});
  }

  return { start, retry, remove };
}
