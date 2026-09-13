import { XmaxEnvironment } from '@xmaxai/react-native-sdk';
import type { XLabLocale } from '../localization/Localization';
import type { SavedConfiguration } from './ConfigurationStore';

/**
 * Matches iOS XLab's language-based service selection without moving credentials.
 * The resolved system locale is used when the preference follows the device.
 * Feature routes capture this environment so an active session keeps its key.
 */
export function configurationForLocale(
  configuration: SavedConfiguration,
  locale: XLabLocale,
): SavedConfiguration {
  return {
    ...configuration,
    environment:
      locale === 'zh-Hans' ? XmaxEnvironment.china : XmaxEnvironment.global,
  };
}
