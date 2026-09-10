import { NativeViewComponent } from '@volcengine/react-native-rtc';
import { Platform, StyleSheet } from 'react-native';

/**
 * Hosts the vendor RTC native view without exposing vendor props to the public
 * components.
 */
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
