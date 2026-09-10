import { useEffect, useRef, useState, type ComponentRef } from 'react';
import {
  Alert,
  AppState,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import type { RealtimeContext, XmaxEnvironment } from '@xmax/react-native-sdk';
import { RealtimeReferenceList } from './RealtimeReferenceList';
import { ReferenceUploadOverlay } from './ReferenceUploadOverlay';
import { useReferenceUploads } from './useReferenceUploads';
import {
  realtimeCategories,
  realtimeReferences,
  type RealtimeCategory,
  type RealtimeReference,
} from './RealtimeReferenceCatalog';

/**
 * Presents categories, reference selection and the free-prompt editor.
 *
 * Custom references upload independently to COS. A selected ready reference
 * submits its remote path; touch trajectories are not implemented.
 */
export function RealtimeControlPanel({
  bottomInset,
  apiKey,
  environment,
  prompt,
  onPromptChange,
  onSubmit,
  onStop,
  connected,
  canSubmit,
}: {
  /** Keeps reference thumbnails and prompt controls above the home indicator. */
  bottomInset: number;
  apiKey: string;
  environment: XmaxEnvironment;
  prompt: string;
  onPromptChange: (text: string) => void;
  onSubmit: (context: RealtimeContext) => void;
  onStop: () => void;
  connected: boolean;
  canSubmit: boolean;
}) {
  const [category, setCategory] = useState<RealtimeCategory>(
    realtimeCategories[0],
  );
  const [references, setReferences] = useState(realtimeReferences);
  const [selectedID, setSelectedID] = useState<string | null>(null);
  const [promptReference, setPromptReference] =
    useState<RealtimeReference | null>(null);
  const [instructionActive, setInstructionActive] = useState(false);
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);

  const pendingReference = useRef<string | null>(null);
  const submitGeneration = useRef(onSubmit);

  submitGeneration.current = onSubmit;

  const pendingPromptPicker = useRef(false);
  const mounted = useRef(true),
    pickerOpen = useRef(false);
  const categoryScroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const categoryFrames = useRef(
    new Map<string, { x: number; width: number }>(),
  );
  const categoryViewport = useRef(0),
    categoryOffset = useRef(0);
  const editor = useRef<ComponentRef<typeof TextInput>>(null);
  const uploads = useReferenceUploads(apiKey, environment, (id, update) => {
    setReferences(current =>
      current.map(item => (item.id === id ? { ...item, ...update } : item)),
    );
    setPromptReference(current =>
      current?.id === id ? { ...current, ...update } : current,
    );
  });

  useEffect(() => {
    mounted.current = true;

    const lifecycle = AppState.addEventListener('change', state => {
      if (state === 'background') pendingReference.current = null;
    });

    return () => {
      mounted.current = false;
      lifecycle.remove();
    };
  }, []);

  useEffect(() => {
    if (!editing) return;

    const subscription = Keyboard.addListener('keyboardDidHide', () =>
      setEditing(false),
    );

    return () => subscription.remove();
  }, [editing]);

  useEffect(() => {
    const reference = references.find(
      item => item.id === pendingReference.current,
    );

    if (
      !reference ||
      reference.id !== selectedID ||
      reference.categoryID !== category.id ||
      reference.uploadState !== 'ready' ||
      !reference.referencePath ||
      !canSubmit ||
      AppState.currentState !== 'active'
    )
      return;

    pendingReference.current = null;
    submitGeneration.current({
      prompt: reference.prompt,
      referencePath: reference.referencePath,
    });
  }, [references, selectedID, category.id, canSubmit]);

  /** Selects a reference and waits for its upload before submitting it once. */
  function selectReference(id: string | null) {
    if (!canSubmit) return;

    pendingReference.current = id;
    setSelectedID(id);
    if (!id && connected) onStop();
  }

  /**
   * Selects a category and scrolls its tab into view without clearing references.
   */
  function selectCategory(next: RealtimeCategory) {
    pendingReference.current = null;
    setCategory(next);

    const frame = categoryFrames.current.get(next.id);

    if (!frame) return;

    const start = frame.x - 18,
      end = frame.x + frame.width + 18;
    const offset = categoryOffset.current,
      width = categoryViewport.current;

    if (start < offset || end > offset + width)
      categoryScroll.current?.scrollTo({
        x: Math.max(0, start < offset ? start : end - width),
        animated: true,
      });
  }

  /**
   * Inserts a thumbnail immediately, then prepares and uploads its image.
   */
  async function pickReference(destination: RealtimeCategory) {
    if (pickerOpen.current) return;

    pickerOpen.current = true;
    setPicking(true);

    try {
      const response = await launchImageLibrary({
        mediaType: 'photo',
        selectionLimit: 1,
        includeBase64: false,
        assetRepresentationMode: 'current',
      });

      if (!mounted.current || response.didCancel) return;
      if (response.errorCode)
        throw new Error(response.errorMessage || '无法读取所选图片');

      const asset = response.assets?.[0];
      const uri = asset?.uri;

      if (!uri || !asset) return;

      const reference: RealtimeReference = {
        id: `custom-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        categoryID: destination.id,
        title: '自定义参考图',
        iconURL: uri,
        prompt: destination.defaultPrompt,
        referencePath: null,
        uploadState: 'uploading',
      };

      if (destination.content === 'prompt') {
        if (promptReference) uploads.remove(promptReference.id);
        setPromptReference(reference);
      } else {
        setReferences(current => [reference, ...current]);
        pendingReference.current = reference.id;
        setSelectedID(reference.id);
      }

      uploads.start(reference, asset);
    } catch (error) {
      if (mounted.current)
        Alert.alert(
          '无法选择参考图',
          error instanceof Error ? error.message : '请重试',
        );
    } finally {
      pickerOpen.current = false;
      if (mounted.current) setPicking(false);
    }
  }

  const submitEnabled =
    canSubmit &&
    !!prompt.trim() &&
    (!promptReference || promptReference.uploadState === 'ready');
  const stopEnabled = connected || selectedID !== null || instructionActive;

  /**
   * Closes the editor and submits the prompt with its successfully uploaded reference.
   */
  function submit() {
    if (!submitEnabled) return;

    setEditing(false);
    Keyboard.dismiss();
    setSelectedID(null);
    pendingReference.current = null;
    onSubmit({ prompt, referencePath: promptReference?.referencePath ?? null });
  }

  const referenceButton = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        !promptReference
          ? '添加自定义模式参考图'
          : promptReference.uploadState === 'uploading'
          ? '正在上传自定义模式参考图'
          : promptReference.uploadState === 'failed'
          ? '重试上传自定义模式参考图'
          : '删除自定义模式参考图'
      }
      accessibilityState={{
        busy: promptReference?.uploadState === 'uploading',
      }}
      disabled={picking || promptReference?.uploadState === 'uploading'}
      onPress={() => {
        if (promptReference) {
          if (promptReference.uploadState === 'failed')
            uploads.retry(promptReference.id);
          else {
            uploads.remove(promptReference.id);
            setPromptReference(null);
          }
        } else {
          if (editing) {
            setEditing(false);
            Keyboard.dismiss();
            // Wait for Modal.onDismiss on iOS before presenting its native picker.
            pendingPromptPicker.current = true;
            if (Platform.OS !== 'ios') {
              pendingPromptPicker.current = false;
              void pickReference(realtimeCategories[5]);
            }
          } else void pickReference(realtimeCategories[5]);
        }
      }}
      style={({ pressed }) => [
        styles.circle,
        styles.referenceButton,
        pressed && styles.pressed,
      ]}
    >
      <Image
        source={
          promptReference
            ? { uri: promptReference.iconURL }
            : require('../assets/realtime/realtime_prompt_add.png')
        }
        style={promptReference ? styles.referenceImage : styles.addIcon}
      />
      {promptReference && (
        <ReferenceUploadOverlay compact state={promptReference.uploadState} />
      )}
    </Pressable>
  );
  const submitButton = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="提交自定义模式描述"
      disabled={!submitEnabled}
      onPress={submit}
      style={({ pressed }) => [
        styles.circle,
        styles.submit,
        !submitEnabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <Image
        source={require('../assets/realtime/realtime_prompt_submit.png')}
        style={styles.submitIcon}
      />
    </Pressable>
  );

  return (
    <View style={[styles.panel, { paddingBottom: bottomInset + 10 }]}>
      <View style={styles.categoryRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="停止生成"
          disabled={!stopEnabled}
          onPress={() => {
            pendingReference.current = null;
            setSelectedID(null);
            setInstructionActive(false);
            if (connected) onStop();
          }}
          style={[styles.stop, !stopEnabled && styles.stopDisabled]}
        >
          <View style={styles.stopRing}>
            <View style={styles.stopSlash} />
          </View>
        </Pressable>
        <ScrollView
          ref={categoryScroll}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categories}
          onLayout={event => {
            categoryViewport.current = event.nativeEvent.layout.width;
          }}
          onScroll={event => {
            categoryOffset.current = event.nativeEvent.contentOffset.x;
          }}
          scrollEventThrottle={16}
        >
          {realtimeCategories.map(item => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityState={{ selected: category.id === item.id }}
              onLayout={event => {
                categoryFrames.current.set(item.id, event.nativeEvent.layout);
              }}
              onPress={() => selectCategory(item)}
              style={styles.category}
            >
              <Text
                style={[
                  styles.categoryLabel,
                  category.id === item.id && styles.selectedCategory,
                ]}
              >
                {item.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      <View style={styles.content}>
        {realtimeCategories
          .filter(item => item.content === 'references')
          .map(item => (
            <RealtimeReferenceList
              key={item.id}
              visible={category.id === item.id}
              references={references.filter(
                reference => reference.categoryID === item.id,
              )}
              selectedID={selectedID}
              onSelect={selectReference}
              onRetry={uploads.retry}
              onAdd={() => {
                void pickReference(item);
              }}
              picking={picking}
            />
          ))}
        {category.content === 'instruction' && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={'触控动图暂未接入'}
            disabled
            accessibilityState={{ disabled: true }}
            style={({ pressed }) => [
              styles.instruction,
              instructionActive && styles.instructionActive,
              pressed && styles.pressed,
            ]}
          >
            <Text
              style={[
                styles.instructionText,
                instructionActive && styles.instructionActiveText,
              ]}
            >
              触控动图暂未接入
            </Text>
          </Pressable>
        )}
        {category.content === 'prompt' && (
          <View style={styles.promptRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="编辑生成提示词"
              onPress={() => setEditing(true)}
              style={styles.promptField}
            >
              <Text
                numberOfLines={1}
                style={[styles.promptText, !prompt && styles.placeholder]}
              >
                {prompt || '输入你想要的效果'}
              </Text>
            </Pressable>
            {referenceButton}
            {submitButton}
          </View>
        )}
      </View>
      <Modal
        visible={editing}
        transparent
        animationType="fade"
        onShow={() => editor.current?.focus()}
        onRequestClose={() => {
          setEditing(false);
          Keyboard.dismiss();
        }}
        onDismiss={() => {
          if (pendingPromptPicker.current) {
            pendingPromptPicker.current = false;
            void pickReference(realtimeCategories[5]);
          }
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.editorOverlay}
        >
          <Pressable
            accessibilityLabel="收起提示词键盘"
            style={styles.editorBackdrop}
            onPress={() => {
              setEditing(false);
              Keyboard.dismiss();
            }}
          />
          <View style={styles.editorPanel}>
            <View style={styles.editorCard}>
              <TextInput
                ref={editor}
                autoFocus
                multiline
                keyboardAppearance="dark"
                accessibilityLabel="生成提示词"
                placeholder="输入你想要的效果"
                placeholderTextColor="#FFFFFF80"
                value={prompt}
                onChangeText={onPromptChange}
                style={styles.editorInput}
              />
              <View style={styles.editorActions}>
                {referenceButton}
                {submitButton}
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: '#101010', paddingTop: 6 },
  categoryRow: { height: 36, flexDirection: 'row', alignItems: 'center' },
  stop: {
    width: 28,
    height: 36,
    marginLeft: 14,
    marginRight: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopDisabled: { opacity: 0.5 },
  stopRing: {
    width: 13,
    height: 13,
    borderWidth: 1,
    borderColor: '#FFF',
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopSlash: {
    width: 12,
    height: 1,
    backgroundColor: '#FFF',
    transform: [{ rotate: '-45deg' }],
  },
  categories: { gap: 14, paddingRight: 14, alignItems: 'center' },
  category: {
    height: 36,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryLabel: {
    color: '#FFFFFF7A',
    fontSize: 13,
    includeFontPadding: false,
  },
  selectedCategory: { color: '#FFF', fontWeight: '600' },
  content: { height: 50, marginTop: 4, justifyContent: 'center' },
  instruction: {
    height: 40,
    marginHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#FFFFFF30',
    backgroundColor: '#FFFFFF24',
    alignItems: 'center',
    justifyContent: 'center',
  },
  instructionActive: { backgroundColor: '#FFFFFF17' },
  instructionText: { fontSize: 13, fontWeight: '500', color: '#FFFFFFD9' },
  instructionActiveText: { color: '#FFFFFF66' },
  promptRow: {
    height: 40,
    marginHorizontal: 14,
    paddingLeft: 11,
    paddingRight: 8,
    borderRadius: 8,
    backgroundColor: '#272728',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  promptField: {
    flex: 1,
    height: 40,
    justifyContent: 'center',
    marginRight: 2,
  },
  promptText: { fontSize: 14, color: '#FFF' },
  placeholder: { color: '#FFFFFF80' },
  circle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  referenceButton: { backgroundColor: '#FFFFFF1F' },
  referenceImage: { width: 28, height: 28 },
  addIcon: { width: 12, height: 12, tintColor: '#FFF' },
  submit: { backgroundColor: '#FF2E88' },
  submitIcon: { width: 11, height: 12, tintColor: '#FFF' },
  disabled: { opacity: 0.2 },
  pressed: { opacity: 0.7, transform: [{ scale: 0.94 }] },
  editorOverlay: { flex: 1, justifyContent: 'flex-end' },
  editorBackdrop: { flex: 1 },
  editorPanel: { height: 138, padding: 14, backgroundColor: '#101010' },
  editorCard: {
    flex: 1,
    borderRadius: 15,
    backgroundColor: '#252525',
    padding: 8,
  },
  editorInput: {
    flex: 1,
    marginHorizontal: 4,
    padding: 0,
    paddingTop: 4,
    color: '#FFF',
    fontSize: 14,
    textAlignVertical: 'top',
  },
  editorActions: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
});
