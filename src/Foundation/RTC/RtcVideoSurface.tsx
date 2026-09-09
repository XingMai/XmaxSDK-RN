import { NativeViewComponent } from '@volcengine/react-native-rtc';
import { Platform, StyleSheet } from 'react-native';
export function RtcVideoSurface({
  viewID,
  onLoad,
}: {
  viewID: string;
  onLoad: () => void;
}) {
  return (
    <NativeViewComponent
      viewId={viewID}
      kind={Platform.OS === 'android' ? 'TextureView' : 'UIView'}
      onLoad={onLoad}
      style={StyleSheet.absoluteFill}
    />
  );
}
