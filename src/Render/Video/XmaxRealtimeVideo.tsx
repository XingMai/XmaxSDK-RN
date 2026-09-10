import { useState } from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
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
        track={localTrack ?? null}
        videoContentMode={videoContentMode}
        style={StyleSheet.absoluteFill}
      />
      {remoteTrack && (
        <RemoteVideoLayer
          key={remote?.id ?? remoteTrack.id}
          track={remoteTrack}
          videoContentMode={videoContentMode}
        />
      )}
    </View>
  );
}

/** Keeps each remote track hidden until ready, then reveals it without animation. */
function RemoteVideoLayer({
  track,
  videoContentMode,
}: {
  track: RealtimeVideoTrack;
  videoContentMode: VideoContentMode;
}) {
  const [displayed, setDisplayed] = useState(false);

  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, !displayed && styles.hidden]}
    >
      <VideoSurface
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
