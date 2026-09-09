import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  XmaxClient,
  XmaxRealtimeVideo,
  RealtimeModel,
  RealtimeConnectionState,
  XmaxError,
  XmaxErrorCode,
  type XmaxEnvironment,
  type XmaxRealtimeManaging,
  type RealtimeMediaStream,
  type RealtimeVideoTrack,
  type RealtimeState,
} from '@xmax/react-native-sdk';
export function CameraScreen({
  apiKey,
  environment,
  onBack,
}: {
  apiKey: string;
  environment: XmaxEnvironment;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  const manager = useRef<XmaxRealtimeManaging | null>(null),
    local = useRef<RealtimeMediaStream | null>(null);
  const alive = useRef(false),
    epoch = useRef(0),
    exiting = useRef(false);
  const [localTrack, setLocalTrack] = useState<RealtimeVideoTrack | null>(null),
    [remoteTrack, setRemoteTrack] = useState<RealtimeVideoTrack | null>(null);
  const [state, setState] = useState<RealtimeState>({
    connectionState: RealtimeConnectionState.idle,
    sessionID: null,
    taskID: null,
  });
  const [busy, setBusy] = useState(true),
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
  const preview = useCallback(
    async (realtime: XmaxRealtimeManaging) => {
      const token = nextOperation();
      setBusy(true);
      setError('');
      setPermissionError(false);
      try {
        const stream = await realtime.createLocalCameraStream();
        if (alive.current && token === epoch.current) {
          local.current = stream;
          setLocalTrack(stream.videoTrack);
        }
      } catch (failure) {
        if (token === epoch.current) showError(failure);
      } finally {
        if (alive.current && token === epoch.current) setBusy(false);
      }
    },
    [showError, nextOperation],
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
  const leave = useCallback(() => {
    if (exiting.current) return;
    exiting.current = true;
    nextOperation();
    void (manager.current?.close() ?? Promise.resolve())
      .catch(() => {})
      .finally(onBack);
  }, [onBack, nextOperation]);
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      leave();
      return true;
    });
    return () => sub.remove();
  }, [leave]);
  const submit = async () => {
    if (!manager.current || !local.current || busy) return;
    if (!apiKey) {
      setError('请返回首页输入 API Key');
      return;
    }
    if (!prompt.trim()) {
      setError('请输入提示词');
      return;
    }
    Keyboard.dismiss();
    const token = nextOperation();
    const realtime = manager.current;
    setBusy(true);
    setError('');
    try {
      const remote = await realtime.connect({ localStream: local.current });
      if (!alive.current || token !== epoch.current) return;
      setRemoteTrack(remote.videoTrack);
      await realtime.startGeneration({ context: { prompt } });
    } catch (failure) {
      if (token === epoch.current) showError(failure);
    } finally {
      if (alive.current && token === epoch.current) setBusy(false);
    }
  };
  const stop = async () => {
    const token = nextOperation();
    setBusy(true);
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
  return (
    <View style={styles.page}>
      <XmaxRealtimeVideo
        localTrack={localTrack}
        remoteTrack={remoteTrack}
        style={StyleSheet.absoluteFill}
      />
      <View
        pointerEvents="box-none"
        style={[styles.top, { top: insets.top + 10 }]}
      >
        <Pressable
          accessibilityLabel="返回"
          onPress={leave}
          style={styles.round}
        >
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="翻转摄像头"
          onPress={flip}
          disabled={busy}
          style={styles.flip}
        >
          <Text style={styles.flipIcon}>↻</Text>
          <Text style={styles.white}>翻转</Text>
        </Pressable>
      </View>
      {busy && !remoteTrack && (
        <View pointerEvents="none" style={styles.wait}>
          <ActivityIndicator color="#fff" />
          <Text style={styles.white}>
            {localTrack ? '正在连接…' : '正在打开摄像头…'}
          </Text>
        </View>
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
        <View
          style={[styles.panel, { paddingBottom: Math.max(insets.bottom, 10) }]}
        >
          <View style={styles.categories}>
            <Pressable
              accessibilityLabel="停止生成"
              disabled={!connected}
              onPress={stop}
              style={styles.stop}
            >
              <Text style={[styles.stopIcon, !connected && styles.muted]}>
                ⊘
              </Text>
            </Pressable>
            <Text style={styles.category}>自由</Text>
            <Text style={styles.status}>
              {state.connectionState === RealtimeConnectionState.generating
                ? '生成中'
                : localTrack
                ? '摄像头预览'
                : ''}
            </Text>
          </View>
          <View style={styles.promptRow}>
            <TextInput
              accessibilityLabel="生成提示词"
              style={styles.prompt}
              placeholder="输入提示词，开始生成"
              placeholderTextColor="#777"
              value={prompt}
              onChangeText={setPrompt}
              returnKeyType="send"
              onSubmitEditing={submit}
              editable={!busy}
            />
            <Pressable
              accessibilityLabel="发送提示词"
              disabled={busy || !localTrack}
              onPress={submit}
              style={styles.send}
            >
              <Text style={styles.sendText}>↑</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#000' },
  top: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  round: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00000025',
    borderRadius: 22,
  },
  back: { fontSize: 44, color: '#fff', lineHeight: 46 },
  flip: { alignItems: 'center', gap: 1, width: 48 },
  flipIcon: { fontSize: 40, color: '#fff', lineHeight: 44 },
  white: { color: '#fff', fontSize: 13 },
  wait: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  panel: { backgroundColor: '#111', paddingHorizontal: 14, paddingTop: 8 },
  categories: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
    gap: 16,
    marginBottom: 10,
  },
  stop: { width: 30, alignItems: 'center' },
  stopIcon: { color: '#fff', fontSize: 26 },
  muted: { color: '#555' },
  category: { color: '#fff', fontSize: 15, fontWeight: '600' },
  status: { flex: 1, textAlign: 'right', fontSize: 11, color: '#888' },
  promptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#252525',
    borderRadius: 20,
    minHeight: 40,
    paddingLeft: 14,
    paddingRight: 5,
    marginBottom: 10,
  },
  prompt: { flex: 1, color: '#fff', fontSize: 14, paddingVertical: 10 },
  send: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendText: { color: '#111', fontSize: 24, fontWeight: '600' },
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
