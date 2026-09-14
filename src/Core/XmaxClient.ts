import { XmaxLogger } from '../Foundation/Logging/XmaxLogger';
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

/**
 * Creates realtime, storage and media services from a shared configuration.
 *
 * Creating a client does not request permissions or start a network session.
 * Each realtime manager owns its own lifecycle and must be closed by its
 * caller.
 */
export class XmaxClient {
  /**
   * The normalized, immutable configuration used by services created by this
   * client.
   */
  readonly configuration: Readonly<Required<XmaxConfiguration>>;

  /**
   * Stores a copy of the configuration, trimming the API key and applying
   * defaults.
   *
   * An empty key is allowed for local camera preview. Invalid configuration
   * values throw XmaxError synchronously.
   */
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

    NativeRuntime.configureLogging(loggerOptions);
    XmaxLogger.configure(loggerOptions, (level, message, option) => {
      NativeRuntime.writeLog(level, message, option);
    });
  }

  /**
   * Creates an independent realtime manager for the selected model.
   *
   * Camera capture starts only when createLocalCameraStream() is called.
   *
   * @returns A manager that the caller must close when it is no longer needed.
   */
  createRealtimeManager(options: RealtimeConfiguration): XmaxRealtimeManaging {
    if (!Object.values(RealtimeModel).includes(options.model))
      throw invalid('Unsupported realtime model');

    return new XmaxRealtimeManager(this.configuration, options);
  }

  /**
   * Creates a storage manager using this client's API key and environment.
   *
   * Throws XmaxError synchronously if the API key is empty. Storage operations
   * are independent of realtime managers and their close() calls.
   */
  createStorageManager(): XmaxStorageManaging {
    if (!this.configuration.apiKey) throw invalid('API key cannot be empty');

    const runtime = {
      ...JSON.parse(NativeRuntime.runtimeInfo()),
      sdk_version: '1.1.0',
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

  /**
   * Creates a service for synchronous model input-size calculations.
   *
   * Defaults to x2.0 and does not allocate camera or RTC resources.
   */
  createMediaService(
    model: RealtimeModel = RealtimeModel.x2_0,
  ): MediaServicing {
    if (!Object.values(RealtimeModel).includes(model))
      throw invalid('Unsupported realtime model');

    return new MediaService(model);
  }
}
