import { XmaxStorageManager } from './Storage/XmaxStorageManager';
import type { XmaxStorageManaging } from './Storage/XmaxStorageManaging';
import { StorageService } from '../Service/Storage/StorageService';
import { StorageManager } from '../Foundation/Storage/StorageManager';
import { ApiService } from '../Service/Network/ApiService';
import NativeRuntime from '../Foundation/Native/NativeXmaxRuntime';
import {
  apiBaseURLs,
  XmaxEnvironment,
  type XmaxConfiguration,
} from './XmaxConfiguration';
import {
  RealtimeModel,
  type RealtimeConfiguration,
} from '../Service/Realtime/RealtimeTypes';
import { invalid } from '../Foundation/Errors/XmaxError';
import { XmaxRealtimeManager } from './Realtime/XmaxRealtimeManager';
import type { XmaxRealtimeManaging } from './Realtime/XmaxRealtimeManaging';
import {
  MediaService,
  type MediaServicing,
} from '../Service/Media/MediaService';
export class XmaxClient {
  readonly configuration: Readonly<Required<XmaxConfiguration>>;
  constructor(configuration: XmaxConfiguration) {
    if (!configuration || typeof configuration.apiKey !== 'string')
      throw invalid('API key must be a string');
    const environment = configuration.environment ?? XmaxEnvironment.china;
    const loggerOptions = configuration.loggerOptions ?? 0;
    if (
      !Object.values(XmaxEnvironment).includes(environment) ||
      !Number.isInteger(loggerOptions) ||
      loggerOptions < 0 ||
      (loggerOptions & ~3) !== 0
    )
      throw invalid('Invalid Xmax configuration');
    this.configuration = Object.freeze({
      apiKey: configuration.apiKey.trim(),
      environment,
      loggerOptions,
    });
  }
  createRealtimeManager(options: RealtimeConfiguration): XmaxRealtimeManaging {
    if (options.model !== RealtimeModel.x2_0)
      throw invalid('Unsupported realtime model');
    return new XmaxRealtimeManager(this.configuration, options);
  }
  createStorageManager(): XmaxStorageManaging {
    if (!this.configuration.apiKey) throw invalid('API key cannot be empty');
    const runtime = {
      ...JSON.parse(NativeRuntime.runtimeInfo()),
      sdk_version: '0.0.1',
    };
    return new XmaxStorageManager(
      new StorageService(
        new ApiService(
          this.configuration.apiKey,
          apiBaseURLs[this.configuration.environment],
          runtime,
        ),
        new StorageManager(),
        () => NativeRuntime.randomUUID(),
      ),
    );
  }
  createMediaService(
    model: RealtimeModel = RealtimeModel.x2_0,
  ): MediaServicing {
    if (model !== RealtimeModel.x2_0)
      throw invalid('Unsupported realtime model');
    return new MediaService(model);
  }
}
