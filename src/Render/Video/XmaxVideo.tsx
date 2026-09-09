import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { View, StyleSheet, type ViewProps } from 'react-native';
import { RtcVideoSurface } from '../../Foundation/RTC/RtcVideoSurface';
import { videoBinding } from '../RenderController';
import {
  VideoContentMode,
  type RealtimeVideoTrack,
} from '../../Service/Realtime/RealtimeTypes';
export interface XmaxVideoProps extends ViewProps {
  track?: RealtimeVideoTrack | null;
  videoContentMode?: VideoContentMode;
}
interface SurfaceProps extends XmaxVideoProps {
  onDisplayed?: (ready: boolean) => void;
}
export function VideoSurface({
  track,
  videoContentMode = VideoContentMode.fill,
  onDisplayed,
  style,
  ...props
}: SurfaceProps) {
  const record = videoBinding(track);
  const viewID = `xmax-${useId().replaceAll(':', '')}-${record?.id ?? 'empty'}`;
  const [loadedViewID, setLoadedViewID] = useState<string | null>(null);
  const loaded = loadedViewID === viewID;
  const callback = useRef(onDisplayed);
  callback.current = onDisplayed;
  const subscribe = useCallback(
    (listener: () => void) => {
      record?.listeners.add(listener);
      return () => {
        record?.listeners.delete(listener);
      };
    },
    [record],
  );
  useSyncExternalStore(subscribe, () => record?.version ?? 0);
  const roomID = record?.remote?.roomID,
    userID = record?.remote?.userID;
  const valid = record?.valid ?? false;
  const bound = useRef(false);
  const shown = useRef(false);
  const mode = useRef(videoContentMode);
  mode.current = videoContentMode;
  useEffect(() => {
    shown.current = false;
    callback.current?.(false);
    if (!loaded || !record || !valid || (!record.local && (!roomID || !userID)))
      return;
    const stream = record.local ? null : { roomID: roomID!, userID: userID! };
    const off = record.rtc.onEvent(event => {
      if (
        event.type !== 'rendered' ||
        !stream ||
        !bound.current ||
        event.stream.roomID !== stream.roomID ||
        event.stream.userID !== stream.userID
      )
        return;
      shown.current = true;
      callback.current?.(record.confirmed);
    });
    try {
      record.rtc.bind(viewID, stream, mode.current);
      bound.current = true;
    } catch {
      callback.current?.(false);
    }
    return () => {
      bound.current = false;
      off();
      try {
        record.rtc.unbind(viewID, stream);
      } catch {
        /* Owner may already have closed. */
      }
    };
  }, [loaded, record, valid, roomID, userID, viewID]);
  useEffect(() => {
    if (!bound.current || !record || !valid) return;
    const stream = record.local ? null : record.remote;
    try {
      record.rtc.bind(viewID, stream, videoContentMode);
    } catch {
      callback.current?.(false);
    }
  }, [record, valid, viewID, videoContentMode]);
  useEffect(() => {
    if (shown.current) callback.current?.(record?.confirmed ?? false);
  }, [record?.confirmed]);
  return (
    <View {...props} style={[styles.container, style]}>
      {valid && (
        <RtcVideoSurface
          viewID={viewID}
          onLoad={() => setLoadedViewID(viewID)}
        />
      )}
    </View>
  );
}
export function XmaxVideo(props: XmaxVideoProps) {
  return <VideoSurface {...props} />;
}
const styles = StyleSheet.create({
  container: { backgroundColor: '#000', overflow: 'hidden' },
});
