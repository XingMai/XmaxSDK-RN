import {
  XmaxClient,
  RealtimeModel,
  CameraPosition,
  VideoContentMode,
  type RealtimeMediaStream,
  type RealtimeState,
  type MediaSize,
  type XmaxRealtimeManaging,
  type XmaxVideoProps,
  type XmaxRealtimeVideoProps,
} from '../lib/typescript';

// Compile the emitted consumer declarations, including negative calls. Never executed.
export async function cameraContract(client: XmaxClient) {
  const manager: XmaxRealtimeManaging = client.createRealtimeManager({
    model: RealtimeModel.x2_0,
  });
  const size: MediaSize = client
    .createMediaService(RealtimeModel.x2_0)
    .resolveModelInputSize({ width: 640, height: 480 });
  const local = await manager.createLocalCameraStream({
    position: CameraPosition.front,
    videoFormat: { ...size, fps: 24 },
    useMicrophone: false,
  });
  const connected: RealtimeMediaStream = await manager.connect({
    localStream: local,
  });
  const generated: RealtimeMediaStream = await manager.startGeneration({
    localStream: local,
    context: { prompt: '水彩' },
  });
  const updated: void = await manager.startGeneration({
    context: { prompt: '油画', referencePath: null },
  });
  const state: RealtimeState = manager.currentState;
  const sessionID: string | null = state.sessionID;
  const taskID: string | null = state.taskID;
  const video: XmaxVideoProps = {
    track: local.videoTrack,
    videoContentMode: VideoContentMode.fit,
  };
  const realtimeVideo: XmaxRealtimeVideoProps = {
    localTrack: local.videoTrack,
    remoteTrack: connected.videoTrack,
  };
  await manager.setStateListener(() => {});
  await manager.setStateListener(null);
  await manager.setErrorListener(null);
  await manager.setCameraPreviewReadyListener(null);
  await manager.setNetworkQualityListener(null);
  await manager.setPerformanceAlarmListener(null);
  await manager.setLocalAudioVolume(0);
  await manager.setRemoteAudioVolume(1);
  await manager.switchCamera();
  await manager.disconnect();
  await manager.stopLocalCameraStream();
  await manager.close();
  // @ts-expect-error No old renamed API.
  manager.getState();
  // @ts-expect-error IDs retain iOS spelling.
  state.sessionId;
  // @ts-expect-error No local video input in this SDK.
  manager.createLocalVideoStream({ fileURL: 'file:///video.mp4' });
  const image: RealtimeMediaStream = await manager.createLocalImageStream({ fileURL: 'file:///image.jpg', videoFormat: null });
  await manager.stopLocalImageStream();
  void image;
  // @ts-expect-error Image input requires a fileURL.
  manager.createLocalImageStream({ uri: 'file:///image.jpg' });
  const storage = client.createStorageManager();
  const uploaded = await storage.uploadImage({fileURL: 'file:///tmp/example.png', progress: p => { const n: number | null = p.fractionCompleted; return n; }});
  const downloaded = await storage.downloadImage({remoteURL: uploaded.url, destinationURL: 'file:///tmp/result.png'});
  const savedFileURL: string = downloaded.fileURL;
  void savedFileURL;
  // @ts-expect-error No interpolation.
  manager.setFrameInterpolationEnabled(true);
  // @ts-expect-error Context-only overload returns void.
  const wrongReturn: RealtimeMediaStream = await manager.startGeneration({
    context: { prompt: '水彩' },
  });
  // @ts-expect-error Public state is readonly.
  state.taskID = 'changed';
  return {
    generated,
    updated,
    sessionID,
    taskID,
    video,
    realtimeVideo,
    wrongReturn,
  };
}
