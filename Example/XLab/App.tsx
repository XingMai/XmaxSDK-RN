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
      {!configuration.loaded ? (
        <View style={styles.loading}>
          {configuration.error ? (
            <>
              <Text style={styles.message}>{configuration.error}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  void store.load();
                }}
              >
                <Text style={styles.retry}>重试</Text>
              </Pressable>
            </>
          ) : (
            <>
              <ActivityIndicator color="#8EF0C8" />
              <Text style={styles.message}>正在读取配置…</Text>
            </>
          )}
        </View>
      ) : (
        <XLabNavigator configuration={configuration} store={store} />
      )}
    </SafeAreaProvider>
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
