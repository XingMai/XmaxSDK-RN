import {
  ACCESSIBLE,
  STORAGE_TYPE,
  getGenericPassword,
  resetGenericPassword,
  setGenericPassword,
} from 'react-native-keychain';
import type {
  ConfigurationField,
  ConfigurationStorage,
} from './ConfigurationStore';

const service = (field: ConfigurationField) =>
  `ai.xmax.xlab.configuration.v1.${field}`;

/**
 * Persists XLab credentials in iOS Keychain / Android Keystore-backed storage.
 * Empty values delete the selected slot. The SDK never uses this host storage.
 */
export const secureConfigurationStorage: ConfigurationStorage = {
  async read(field) {
    const result = await getGenericPassword({ service: service(field) });

    return result ? result.password : null;
  },

  async write(field, value) {
    if (!value) {
      await resetGenericPassword({ service: service(field) });
      return;
    }

    // Keychain 10.0.0 on iOS treats any supplied cloudSync value as true,
    // even false. Omit it to keep writes local, matching reads and deletion.
    const result = await setGenericPassword('xlab', value, {
      service: service(field),
      accessible: ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      storage: STORAGE_TYPE.AES_GCM_NO_AUTH,
    });

    if (!result) throw new Error('Unable to save XLab configuration');
  },
};
