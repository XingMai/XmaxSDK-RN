import {
  RTCVideo,
  RemoteStreamKey,
  StreamIndex,
  VideoCanvas,
  type IEngine,
} from '@volcengine/react-native-rtc';
import { Platform } from 'react-native';
import type { RemoteStream } from './RtcManager';

/**
 * Detaches a renderer using a fresh native canvas whose view is unset.
 *
 * The RN convenience setters always wrap viewId in a native-view reference,
 * including an empty ID. Call the exported typed setters instead: this avoids
 * both unresolved Android view references and explicit JSON null on iOS.
 */
export function detachRtcCanvas(
  engine: IEngine,
  stream: RemoteStream | null,
): number {
  // IEngine is the same RTCVideo instance with convenience setters installed.
  const video = engine as unknown as RTCVideo;
  const canvas = new VideoCanvas();

  if (!stream)
    return RTCVideo.prototype.setLocalVideoCanvas.call(
      video,
      StreamIndex.STREAM_INDEX_MAIN,
      canvas,
    );

  const key =
    Platform.OS === 'android'
      ? new RemoteStreamKey(
          stream.roomID,
          stream.userID,
          StreamIndex.STREAM_INDEX_MAIN,
        )
      : new RemoteStreamKey();
  if (Platform.OS !== 'android') {
    key.roomId = stream.roomID;
    key.userId = stream.userID;
    key.streamIndex = StreamIndex.STREAM_INDEX_MAIN;
  }

  return RTCVideo.prototype.setRemoteVideoCanvas.call(video, key, canvas);
}
