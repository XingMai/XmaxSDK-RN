import type {
  XmaxStorageManaging,
  UploadFileOptions,
  DownloadFileOptions,
} from './XmaxStorageManaging';
import { StorageService } from '../../Service/Storage/StorageService';

/**
 * Implements the public storage contract by delegating to the storage service.
 *
 * The concrete manager remains internal; callers use XmaxStorageManaging.
 */
export class XmaxStorageManager implements XmaxStorageManaging {
  constructor(private readonly service: StorageService) {}

  uploadImage(options: UploadFileOptions) {
    return this.service.upload(options, 'image', false);
  }

  uploadImageWithSafetyCheck(options: UploadFileOptions) {
    return this.service.upload(options, 'image', true);
  }

  uploadVideo(options: UploadFileOptions) {
    return this.service.upload(options, 'video', false);
  }

  downloadImage(options: DownloadFileOptions) {
    return this.service.download(options);
  }

  downloadVideo(options: DownloadFileOptions) {
    return this.service.download(options);
  }
}
