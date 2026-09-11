import { createContext, useContext } from 'react';
import { StyleSheet } from 'react-native';
import { DarkTheme, NavigationContainer } from '@react-navigation/native';
import {
  createNativeStackNavigator,
  type NativeStackScreenProps,
} from '@react-navigation/native-stack';
import type { XmaxEnvironment } from '@xmax/react-native-sdk';
import type {
  ConfigurationStore,
  SavedConfiguration,
} from '../configuration/ConfigurationStore';
import { FeedScreen } from '../screens/FeedScreen';
import { CameraScreen } from '../screens/CameraScreen';
import { RealtimeScreen } from '../screens/RealtimeScreen';
import { StorageScreen } from '../screens/StorageScreen';

/** Navigation state contains input selection, while credentials stay in context. */
export type XLabStackParamList = {
  Feed: undefined;
  Camera: { environment: XmaxEnvironment };
  Image: {
    environment: XmaxEnvironment;
    fileURL: string;
    customTrajectory: boolean;
    contentType: string | undefined;
  };
  Storage: { environment: XmaxEnvironment };
};

interface ConfigurationContextValue {
  configuration: SavedConfiguration;
  store: ConfigurationStore;
}

const ConfigurationContext = createContext<ConfigurationContextValue | null>(
  null,
);
const Stack = createNativeStackNavigator<XLabStackParamList>();

function useXLabConfiguration() {
  const value = useContext(ConfigurationContext);

  if (!value) throw new Error('XLab configuration provider is missing');

  return value;
}

/** Remains mounted beneath feature screens, preserving the ScrollView offset. */
function FeedRoute({
  navigation,
}: NativeStackScreenProps<XLabStackParamList, 'Feed'>) {
  const { configuration, store } = useXLabConfiguration();

  return (
    <FeedScreen
      configuration={configuration}
      onAPIKeyChange={value => store.setKey(configuration.environment, value)}
      onLanguageChange={value => store.selectLanguage(value)}
      onRetrySave={() => {
        void store.flush();
      }}
      onCamera={(_apiKey, environment) => {
        if (navigation.isFocused())
          navigation.navigate('Camera', { environment });
      }}
      onImage={(
        _apiKey,
        environment,
        fileURL,
        customTrajectory,
        contentType,
      ) => {
        if (navigation.isFocused())
          navigation.navigate('Image', {
            environment,
            fileURL,
            customTrajectory,
            contentType,
          });
      }}
      onStorage={(_apiKey, environment) => {
        if (navigation.isFocused())
          navigation.navigate('Storage', { environment });
      }}
    />
  );
}

function CameraRoute({
  route,
  navigation,
}: NativeStackScreenProps<XLabStackParamList, 'Camera'>) {
  const { configuration } = useXLabConfiguration();

  return (
    <CameraScreen
      apiKey={configuration.keys[route.params.environment].trim()}
      environment={route.params.environment}
      onBack={navigation.goBack}
    />
  );
}

function ImageRoute({
  route,
  navigation,
}: NativeStackScreenProps<XLabStackParamList, 'Image'>) {
  const { configuration } = useXLabConfiguration();

  return (
    <RealtimeScreen
      apiKey={configuration.keys[route.params.environment].trim()}
      environment={route.params.environment}
      fileURL={route.params.fileURL}
      customTrajectory={route.params.customTrajectory}
      imageContentType={route.params.contentType}
      onBack={navigation.goBack}
    />
  );
}

function StorageRoute({
  route,
  navigation,
}: NativeStackScreenProps<XLabStackParamList, 'Storage'>) {
  const { configuration } = useXLabConfiguration();

  return (
    <StorageScreen
      apiKey={configuration.keys[route.params.environment].trim()}
      environment={route.params.environment}
      onBack={navigation.goBack}
    />
  );
}

/** Owns the native page stack without recreating route components on app updates. */
export function XLabNavigator(props: ConfigurationContextValue) {
  return (
    <ConfigurationContext.Provider value={props}>
      <NavigationContainer theme={DarkTheme}>
        <Stack.Navigator
          initialRouteName="Feed"
          screenOptions={{
            headerShown: false,
            headerBackButtonMenuEnabled: false,
            contentStyle: styles.content,
            animation: 'slide_from_right',
            gestureEnabled: true,
          }}
        >
          <Stack.Screen name="Feed" component={FeedRoute} />
          <Stack.Screen name="Camera" component={CameraRoute} />
          <Stack.Screen name="Image" component={ImageRoute} />
          <Stack.Screen name="Storage" component={StorageRoute} />
        </Stack.Navigator>
      </NavigationContainer>
    </ConfigurationContext.Provider>
  );
}

const styles = StyleSheet.create({
  content: { backgroundColor: '#000' },
});
