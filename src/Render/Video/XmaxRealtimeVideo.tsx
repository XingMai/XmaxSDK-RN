import NativeRuntime from '../../Foundation/Native/NativeXmaxRuntime';
import type { TrajectoryEffectRendering } from '../Trajectory/TrajectoryEffectRendering';
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentRef,
} from 'react';
import { findNodeHandle, StyleSheet, View, type ViewProps } from 'react-native';
import { VideoSurface } from './XmaxVideo';
import { videoBinding } from '../RenderController';
import {
  VideoContentMode,
  type RealtimeVideoTrack,
} from '../../Service/Realtime/RealtimeTypes';

/**
 * Props for a local preview with a remote generation overlay.
 */
export interface XmaxRealtimeVideoProps extends ViewProps {
  /**
   * The local preview track. Must share its manager with remoteTrack when both
   * are supplied.
   */
  localTrack?: RealtimeVideoTrack | null;

  /**
   * The remote track to show after task confirmation and a matching render
   * event.
   */
  remoteTrack?: RealtimeVideoTrack | null;

  /**
   * How both video layers scale inside the view. Defaults to
   * VideoContentMode.fill.
   */
  videoContentMode?: VideoContentMode;

  /** Enables remote multi-touch interaction during generation. Defaults to true. */
  isInteractionEnabled?: boolean;

  /** Custom visual renderer; null or omitted restores the SDK green glow. */
  trajectoryRenderer?: TrajectoryEffectRendering | null | undefined;
}

/**
 * Displays local preview until the remote generation can be shown.
 *
 * Both tracks must belong to the same manager. Removing the remote track
 * reveals the local preview; unmounting does not close the manager. Loading
 * indicators and error presentation belong to the host UI, as in iOS.
 */
export function XmaxRealtimeVideo({
  localTrack,
  remoteTrack,
  videoContentMode = VideoContentMode.fill,
  isInteractionEnabled = true,
  trajectoryRenderer,
  style,
  ...props
}: XmaxRealtimeVideoProps) {
  const local = videoBinding(localTrack),
    remote = videoBinding(remoteTrack);

  if (local && remote && local.owner !== remote.owner)
    throw new Error(
      'Video tracks must belong to the same Xmax realtime manager',
    );

  return (
    <View {...props} style={[styles.container, style]}>
      <VideoSurface
        isInteractionEnabled={false}
        track={localTrack ?? null}
        videoContentMode={videoContentMode}
        style={StyleSheet.absoluteFill}
      />
      {remoteTrack && (
        <RemoteVideoLayer
          key={remote?.id ?? remoteTrack.id}
          isInteractionEnabled={isInteractionEnabled}
          trajectoryRenderer={trajectoryRenderer}
          track={remoteTrack}
          videoContentMode={videoContentMode}
        />
      )}
    </View>
  );
}

/**
 * Reveals ready remote pixels without animation. Binding invalidation hides the
 * whole layer in the same render that removes its canvas, matching iOS teardown.
 */
function RemoteVideoLayer({
  track,
  videoContentMode,
  isInteractionEnabled,
  trajectoryRenderer,
}: {
  track: RealtimeVideoTrack;
  videoContentMode: VideoContentMode;
  isInteractionEnabled: boolean;
  trajectoryRenderer: TrajectoryEffectRendering | null | undefined;
}) {
  const record = videoBinding(track);
  const container = useRef<ComponentRef<typeof View>>(null);
  const nativeID = `xmax-remote-${record?.id ?? track.id}`;

  useLayoutEffect(() => {
    if (!record) return;
    const hide = async () => {
      const tag = findNodeHandle(container.current);
      if (typeof tag === 'number')
        await NativeRuntime.hideVideoContainer(tag, nativeID);
    };
    record.hideBeforeRelease.add(hide);

    return () => {
      record.hideBeforeRelease.delete(hide);
    };
  }, [record, nativeID]);
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
  const [displayed, setDisplayed] = useState(false);

  // The child's onDisplayed(false) arrives from an effect after canvas removal.
  // Read validity here so that stale readiness cannot expose the empty black layer.
  const visible =
    displayed && record?.valid && !record.retiring && record.confirmed;

  return (
    <View
      ref={container}
      nativeID={nativeID}
      collapsable={false}
      pointerEvents={visible ? 'auto' : 'none'}
      style={[StyleSheet.absoluteFill, !visible && styles.hidden]}
    >
      <VideoSurface
        isInteractionEnabled={isInteractionEnabled}
        trajectoryRenderer={trajectoryRenderer}
        track={track}
        videoContentMode={videoContentMode}
        onDisplayed={setDisplayed}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#000', overflow: 'hidden' },
  hidden: { opacity: 0 },
});
