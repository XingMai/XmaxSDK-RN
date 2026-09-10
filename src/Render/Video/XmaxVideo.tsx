import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { Image, View, StyleSheet, type ViewProps } from 'react-native';
import { RtcVideoSurface } from '../../Foundation/RTC/RtcVideoSurface';
import { videoBinding } from '../RenderController';
import { VideoSurfaceBinding } from './VideoSurfaceBinding';
import {
  VideoContentMode,
  type RealtimeVideoTrack,
} from '../../Service/Realtime/RealtimeTypes';

/**
 * Props for rendering one manager-owned video track in a React Native view.
 */
export interface XmaxVideoProps extends ViewProps {
  /**
   * The track to render. Omitted, null or invalidated tracks show the black
   * background.
   */
  track?: RealtimeVideoTrack | null;

  /**
   * How the video scales inside the view. Defaults to VideoContentMode.fill.
   */
  videoContentMode?: VideoContentMode;
}

interface SurfaceProps extends XmaxVideoProps {
  onDisplayed?: (ready: boolean) => void;
}

/**
 * Binds a native RTC view to a valid track and reports matching remote render
 * events.
 */
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
  const binding = useRef<VideoSurfaceBinding | null>(null);
  const mode = useRef(videoContentMode);

  mode.current = videoContentMode;
  useEffect(() => {
    callback.current?.(false);
    if (
      !loaded ||
      !record ||
      record.imageURL ||
      !valid ||
      (!record.local && (!roomID || !userID))
    )
      return;

    const stream = record.local ? null : { roomID: roomID!, userID: userID! };
    const surface = new VideoSurfaceBinding(record, viewID, stream, ready => {
      callback.current?.(ready);
    });

    binding.current = surface;
    surface.start(mode.current);

    return () => {
      binding.current = null;
      surface.dispose();
    };
  }, [loaded, record, valid, roomID, userID, viewID]);

  useEffect(() => {
    binding.current?.setContentMode(videoContentMode);
  }, [videoContentMode]);

  useEffect(() => {
    binding.current?.refresh();
  }, [record?.confirmed]);

  return (
    <View {...props} style={[styles.container, style]}>
      {valid && record?.imageURL ? (
        <Image
          key={record.id}
          source={{ uri: record.imageURL }}
          style={StyleSheet.absoluteFill}
          resizeMode={
            videoContentMode === VideoContentMode.fit ? 'contain' : 'cover'
          }
        />
      ) : (
        valid && (
          <RtcVideoSurface
            viewID={viewID}
            onLoad={() => setLoadedViewID(viewID)}
          />
        )
      )}
    </View>
  );
}

/**
 * Renders camera and remote tracks using RTC, and local image tracks using RN Image.
 *
 * Unmounting unbinds the view; the caller still owns the manager lifecycle.
 */
export function XmaxVideo(props: XmaxVideoProps) {
  return <VideoSurface {...props} />;
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#000', overflow: 'hidden' },
});
