import { useCallback, useState } from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { XmaxEnvironment } from '@xmax/react-native-sdk';
import { FeedScreen } from './src/screens/FeedScreen';
import { CameraScreen } from './src/screens/CameraScreen';
export default function App() {
  const [camera, setCamera] = useState<{
    apiKey: string;
    environment: XmaxEnvironment;
  } | null>(null);
  const [lastConfiguration, setLastConfiguration] = useState({
    apiKey: '',
    environment: XmaxEnvironment.china,
  });
  const back = useCallback(() => setCamera(null), []);
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" />
      {camera ? (
        <CameraScreen
          apiKey={camera.apiKey}
          environment={camera.environment}
          onBack={back}
        />
      ) : (
        <FeedScreen
          initialConfiguration={lastConfiguration}
          onCamera={(apiKey, environment) => {
            const configuration = { apiKey, environment };
            setLastConfiguration(configuration);
            setCamera(configuration);
          }}
        />
      )}
    </SafeAreaProvider>
  );
}
