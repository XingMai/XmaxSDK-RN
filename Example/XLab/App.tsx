import { useCallback, useState } from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { XmaxEnvironment } from '@xmax/react-native-sdk';
import { FeedScreen } from './src/screens/FeedScreen';
import { CameraScreen } from './src/screens/CameraScreen';
import { StorageScreen } from './src/screens/StorageScreen';
export default function App() {
  const [screen, setScreen] = useState<{
    page: 'camera' | 'storage';
    apiKey: string;
    environment: XmaxEnvironment;
  } | null>(null);
  const [lastConfiguration, setLastConfiguration] = useState({
    apiKey: '',
    environment: XmaxEnvironment.china,
  });
  const back = useCallback(() => setScreen(null), []);
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" />
      {screen?.page === 'camera' ? (
        <CameraScreen
          apiKey={screen.apiKey}
          environment={screen.environment}
          onBack={back}
        />
      ) : screen?.page === 'storage' ? (
        <StorageScreen
          onBack={back}
          apiKey={screen.apiKey}
          environment={screen.environment}
        />
      ) : (
        <FeedScreen
          initialConfiguration={lastConfiguration}
          onStorage={(apiKey, environment) => {
            const configuration = { apiKey, environment };
            setLastConfiguration(configuration);
            setScreen({ ...configuration, page: 'storage' });
          }}
          onCamera={(apiKey, environment) => {
            const configuration = { apiKey, environment };
            setLastConfiguration(configuration);
            setScreen({ ...configuration, page: 'camera' });
          }}
        />
      )}
    </SafeAreaProvider>
  );
}
