import { useEffect, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { ConfigurationStore } from './ConfigurationStore';
import { secureConfigurationStorage } from './SecureConfigurationStorage';

/** Keeps configuration alive across feature navigation and flushes unsaved edits. */
export function useConfiguration() {
  const [store] = useState(
    () => new ConfigurationStore(secureConfigurationStorage),
  );
  const configuration = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
  );

  useEffect(() => {
    void store.load();

    const lifecycle = AppState.addEventListener('change', () => {
      void store.flush();
    });

    return () => {
      lifecycle.remove();
      void store.flush();
    };
  }, [store]);

  return { configuration, store };
}
