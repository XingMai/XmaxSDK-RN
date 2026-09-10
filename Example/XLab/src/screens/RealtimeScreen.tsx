import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  XmaxClient,
  XmaxRealtimeVideo,
  RealtimeModel,
  VideoContentMode,
  type RealtimeContext,
  RealtimeConnectionState,
  XmaxError,
  XmaxErrorCode,
  type XmaxEnvironment,
  type XmaxRealtimeManaging,
  type RealtimeMediaStream,
  type RealtimeVideoTrack,
  type RealtimeState,
} from '@xmax/react-native-sdk';
import { RealtimeControlPanel } from '../realtime/RealtimeControlPanel';
import { RealtimeLoadingOverlay } from '../realtime/RealtimeLoadingOverlay';

/**
 * Owns camera or image preview and its prompt/reference generation lifecycle.
 *
 * Closes the realtime manager on unmount or backgrounding. Foreground recovery
 * restores local preview without automatically restarting generation.
 * Native back gestures remain uninterrupted; cancelling a swipe keeps preview alive.
 * The preview ends above the control panel; file input starts 68 points below
 * the top safe area, matching the UIKit XLab viewport.
 */
export function RealtimeScreen({
  apiKey,
  environment,
  onBack,
  fileURL,
}: {
  apiKey: string;
  environment: XmaxEnvironment;
  onBack: () => void;
  /** Omit for camera capture; otherwise keep this source readable until exit. */
  fileURL?: string;
}) {
  const insets = useSafeAreaInsets();
  const manager = useRef<XmaxRealtimeManaging | null>(null),
    local = useRef<RealtimeMediaStream | null>(null);
  const alive = useRef(false),
    epoch = useRef(0);

  const [localTrack, setLocalTrack] = useState<RealtimeVideoTrack | null>(null),
    [remoteTrack, setRemoteTrack] = useState<RealtimeVideoTrack | null>(null);
  const [state, setState] = useState<RealtimeState>({
    connectionState: RealtimeConnectionState.idle,
    sessionID: null,
    taskID: null,
  });
  const [busy, setBusy] = useState(true),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [prompt, setPrompt] = useState(''),
    [permissionError, setPermissionError] = useState(false);

  const nextOperation = useCallback(() => ++epoch.current, []);

  const showError = useCallback((value: unknown) => {
    const failure = XmaxError.from(value);

    if (alive.current && failure.code !== XmaxErrorCode.cancelled) {
      setError(failure.message);
      setPermissionError(
        [
          XmaxErrorCode.cameraPermissionDenied,
          XmaxErrorCode.microphonePermissionDenied,
        ].includes(failure.code),
      );
    }
  }, []);

  /**
   * Starts local preview and ignores results from an obsolete screen operation.
   */
  const preview = useCallback(
    async (realtime: XmaxRealtimeManaging) => {
      const token = nextOperation();

      setBusy(true);
      setLoading(true);
      setError('');
      setPermissionError(false);

      try {
        const stream = fileURL
          ? await realtime.createLocalImageStream({ fileURL })
          : await realtime.createLocalCameraStream();

        if (alive.current && token === epoch.current) {
          local.current = stream;
          setLocalTrack(stream.videoTrack);
        }
      } catch (failure) {
        if (token === epoch.current) showError(failure);
      } finally {
        if (alive.current && token === epoch.current) {
          setBusy(false);
          setLoading(false);
        }
      }
    },
    [showError, nextOperation, fileURL],
  );

  useEffect(() => {
    alive.current = true;

    const realtime = new XmaxClient({
      apiKey,
      environment,
    }).createRealtimeManager({ model: RealtimeModel.x2_0 });

    manager.current = realtime;
    void realtime.setStateListener(value => {
      if (!alive.current) return;

      setState(value);
      if (
        [
          RealtimeConnectionState.disconnected,
          RealtimeConnectionState.error,
        ].includes(value.connectionState)
      )
        setRemoteTrack(null);
    });
    void realtime.setErrorListener(showError);
    void preview(realtime);

    let previous = AppState.currentState;
    let closing: Promise<void> = Promise.resolve();
    const appState = AppState.addEventListener('change', next => {
      if (next === 'background') {
        nextOperation();
        setLoading(false);
        local.current = null;
        setLocalTrack(null);
        setRemoteTrack(null);
        closing = realtime.close().catch(showError);
      } else if (next === 'active' && previous === 'background') {
        void closing.then(() => {
          if (alive.current) return preview(realtime);
        });
      }
      if (next !== 'inactive') previous = next;
    });

    // Release on unmount without cancelling and replaying the native back gesture.
    // Invalidate pending work first so late results cannot restore the removed screen.
    return () => {
      alive.current = false;
      nextOperation();
      manager.current = null;
      local.current = null;
      appState.remove();
      void realtime.setStateListener(null);
      void realtime.setErrorListener(null);
      void realtime.close().catch(() => {});
    };
  }, [apiKey, environment, preview, showError, nextOperation]);

  /**
   * Mounts the remote track before starting or updating prompt/reference generation.
   */
  const submit = async (context: RealtimeContext) => {
    if (!manager.current || !local.current || busy) return;
    if (!apiKey) {
      setError('请返回首页输入 API Key');
      return;
    }
    if (!context.prompt.trim()) {
      setError('请输入提示词');
      return;
    }

    Keyboard.dismiss();

    const token = nextOperation();
    const realtime = manager.current;

    setBusy(true);
    setLoading(true);
    setError('');

    try {
      const remote = await realtime.connect({ localStream: local.current });

      if (!alive.current || token !== epoch.current) return;

      setRemoteTrack(remote.videoTrack);
      await realtime.startGeneration({ context });
    } catch (failure) {
      if (token === epoch.current) showError(failure);
    } finally {
      if (alive.current && token === epoch.current) {
        setBusy(false);
        setLoading(false);
      }
    }
  };

  /**
   * Disconnects generation while preserving the local media preview.
   */
  const stop = async () => {
    const token = nextOperation();

    setBusy(true);
    setLoading(false);

    try {
      await manager.current?.disconnect();
    } catch (failure) {
      showError(failure);
    } finally {
      if (alive.current && token === epoch.current) {
        setRemoteTrack(null);
        setBusy(false);
      }
    }
  };

  /**
   * Switches the camera and applies the result only to the active operation.
   */
  const flip = async () => {
    if (busy || !manager.current) return;

    const token = nextOperation();

    setBusy(true);

    try {
      const stream = await manager.current.switchCamera();

      if (alive.current && token === epoch.current) {
        local.current = stream;
        setLocalTrack(stream.videoTrack);
      }
    } catch (failure) {
      if (token === epoch.current) showError(failure);
    } finally {
      if (alive.current && token === epoch.current) setBusy(false);
    }
  };

  const connected = [
    RealtimeConnectionState.connecting,
    RealtimeConnectionState.connected,
    RealtimeConnectionState.generating,
  ].includes(state.connectionState);
  const previewTop = fileURL ? insets.top + 68 : 0;

  return (
    <View style={styles.page}>
      <View style={[styles.preview, { marginTop: previewTop }]}>
        <XmaxRealtimeVideo
          localTrack={localTrack}
          remoteTrack={remoteTrack}
          videoContentMode={
            fileURL ? VideoContentMode.fit : VideoContentMode.fill
          }
          style={StyleSheet.absoluteFill}
        />
        <RealtimeLoadingOverlay loading={loading} />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="返回首页"
        onPress={onBack}
        style={({ pressed }) => [
          styles.backButton,
          { top: insets.top + 8 },
          pressed && styles.pressed,
        ]}
      >
        <Image
          source={require('../assets/realtime/realtime_nav_back.png')}
          style={styles.backIcon}
        />
      </Pressable>
      {!fileURL && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="翻转摄像头"
          onPress={flip}
          disabled={busy}
          style={({ pressed }) => [
            styles.flip,
            { top: insets.top + 6 },
            pressed && styles.pressed,
          ]}
        >
          <Image
            source={require('../assets/realtime/realtime_camera_rotate.png')}
            style={styles.flipIcon}
          />
          <Text style={styles.flipLabel}>翻转</Text>
        </Pressable>
      )}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.bottom}
      >
        {!!error && (
          <View style={styles.error}>
            <Text style={styles.errorText}>{error}</Text>
            {permissionError ? (
              <Pressable
                onPress={() => {
                  void Linking.openSettings();
                }}
              >
                <Text style={styles.retry}>打开设置</Text>
              </Pressable>
            ) : (
              !localTrack && (
                <Pressable
                  onPress={() => {
                    if (manager.current) void preview(manager.current);
                  }}
                >
                  <Text style={styles.retry}>重试</Text>
                </Pressable>
              )
            )}
          </View>
        )}
        <RealtimeControlPanel
          bottomInset={insets.bottom}
          apiKey={apiKey}
          environment={environment}
          prompt={prompt}
          onPromptChange={setPrompt}
          onSubmit={context => {
            void submit(context);
          }}
          onStop={() => {
            void stop();
          }}
          connected={connected}
          canSubmit={!busy && !!localTrack}
        />
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#000' },
  preview: { flex: 1, minHeight: 0, overflow: 'hidden' },
  backButton: {
    position: 'absolute',
    left: 12,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: { width: 32, height: 32, resizeMode: 'contain' },
  flip: {
    position: 'absolute',
    right: 8,
    width: 58,
    height: 62,
    paddingTop: 9,
    alignItems: 'center',
  },
  flipIcon: {
    width: 22,
    height: 22,
    resizeMode: 'contain',
    tintColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  flipLabel: {
    marginTop: 5,
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
    includeFontPadding: false,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  pressed: { opacity: 0.7 },
  bottom: { flexShrink: 0 },
  error: {
    margin: 14,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#381B1BF0',
    gap: 8,
  },
  errorText: { fontSize: 13, lineHeight: 19, color: '#FFD6D6' },
  retry: { fontSize: 13, color: '#8EF0C8', fontWeight: '600' },
});
