import {
  ActivityIndicator,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { XLabNavigator } from './src/navigation/XLabNavigator';
import { useConfiguration } from './src/configuration/useConfiguration';
import type {
  ConfigurationStore,
  SavedConfiguration,
} from './src/configuration/ConfigurationStore';
import {
  LocalizationProvider,
  useLocalization,
} from './src/localization/LocalizationProvider';

/**
 * Owns XLab navigation and environment-specific persisted API configuration.
 *
 * Each feature screen owns its SDK resources and releases them on exit.
 */
export default function App() {
  const { configuration, store } = useConfiguration();

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" />
      <LocalizationProvider language={configuration.language}>
        <ConfigurationContent configuration={configuration} store={store} />
      </LocalizationProvider>
    </SafeAreaProvider>
  );
}

/** Displays startup and retry messages in the selected home-screen language. */
function ConfigurationContent({
  configuration,
  store,
}: {
  configuration: SavedConfiguration;
  store: ConfigurationStore;
}) {
  const { t } = useLocalization();

  return (
    <>
      {!configuration.loaded ? (
        <View style={styles.loading}>
          {configuration.error ? (
            <>
              <Text style={styles.message}>{t(configuration.error)}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  void store.load();
                }}
              >
                <Text style={styles.retry}>{t('common.retry')}</Text>
              </Pressable>
            </>
          ) : (
            <>
              <ActivityIndicator color="#8EF0C8" />
              <Text style={styles.message}>{t('configuration.loading')}</Text>
            </>
          )}
        </View>
      ) : (
        <XLabNavigator configuration={configuration} store={store} />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    backgroundColor: '#0C121B',
  },
  message: { color: '#8E9AA9', fontSize: 14 },
  retry: { color: '#8EF0C8', fontSize: 14, padding: 12 },
});
