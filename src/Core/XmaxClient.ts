import { XmaxEnvironment, type XmaxConfiguration } from './XmaxConfiguration';
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
  createMediaService(
    model: RealtimeModel = RealtimeModel.x2_0,
  ): MediaServicing {
    if (model !== RealtimeModel.x2_0)
      throw invalid('Unsupported realtime model');
    return new MediaService(model);
  }
}
