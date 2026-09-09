import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  StyleSheet,
  Text,
  View,
  type ViewProps,
} from 'react-native';
import { VideoSurface } from './XmaxVideo';
import { videoBinding } from '../RenderController';
import {
  VideoContentMode,
  type RealtimeVideoTrack,
} from '../../Service/Realtime/RealtimeTypes';
export interface XmaxRealtimeVideoProps extends ViewProps {
  localTrack?: RealtimeVideoTrack | null;
  remoteTrack?: RealtimeVideoTrack | null;
  videoContentMode?: VideoContentMode;
}
export function XmaxRealtimeVideo({
  localTrack,
  remoteTrack,
  videoContentMode = VideoContentMode.fill,
  style,
  ...props
}: XmaxRealtimeVideoProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const [ready, setReady] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const local = videoBinding(localTrack),
    remote = videoBinding(remoteTrack);
  if (local && remote && local.owner !== remote.owner)
    throw new Error(
      'Video tracks must belong to the same Xmax realtime manager',
    );
  const display = useCallback(
    (value: boolean) => {
      setReady(value);
      Animated.timing(opacity, {
        toValue: value ? 1 : 0,
        duration: value ? 300 : 0,
        useNativeDriver: true,
      }).start();
    },
    [opacity],
  );
  useEffect(() => {
    display(false);
    setTimedOut(false);
  }, [remoteTrack, display]);
  useEffect(() => {
    if (!remoteTrack || ready) return;
    const timer = setTimeout(() => setTimedOut(true), 40000);
    return () => clearTimeout(timer);
  }, [remoteTrack, ready]);
  return (
    <View {...props} style={[styles.container, style]}>
      <VideoSurface
        track={localTrack ?? null}
        videoContentMode={videoContentMode}
        style={StyleSheet.absoluteFill}
      />
      {remoteTrack && (
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { opacity }]}
        >
          <VideoSurface
            track={remoteTrack}
            videoContentMode={videoContentMode}
            onDisplayed={display}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      )}
      {remoteTrack && !ready && (
        <View pointerEvents="none" style={styles.wait}>
          <ActivityIndicator color="#fff" />
          <Text style={styles.text}>
            {timedOut ? '画面尚未显示，请停止后重试' : '等待生成画面…'}
          </Text>
        </View>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  container: { backgroundColor: '#000', overflow: 'hidden' },
  wait: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#00000044',
  },
  text: { color: '#fff', fontSize: 14 },
});
