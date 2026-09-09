import React from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { HelloWorldScreen } from './src/screens/HelloWorldScreen';

export default function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" />
      <HelloWorldScreen />
    </SafeAreaProvider>
  );
}
