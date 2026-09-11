import { useLocalization } from '../localization/LocalizationProvider';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import {
  Animated,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import type { RealtimeReference } from './RealtimeReferenceCatalog';
import { ReferenceUploadOverlay } from './ReferenceUploadOverlay';
import { ReferenceThumbnail } from './ReferenceThumbnail';

const thumbnailSize = 44;
const thumbnailGap = 8;
const thumbnailStride = thumbnailSize + thumbnailGap;

/**
 * Animates the scroll-edge shading without intercepting thumbnail touches.
 */
function EdgeFade({ visible, left }: { visible: boolean; left?: boolean }) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    });

    animation.start();

    return () => animation.stop();
  }, [visible, opacity]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.fade,
        left ? styles.leftFade : styles.rightFade,
        { opacity },
      ]}
    />
  );
}

/**
 * Displays a category's reference thumbnails beside a fixed add button.
 *
 * Selection belongs to the parent. Selecting the same item clears it. Visible
 * thumbnails stay still so consecutive taps are not captured by scroll animations.
 */
export function RealtimeReferenceList({
  references,
  selectedID,
  onSelect,
  onRetry,
  onAdd,
  visible,
  picking,
}: {
  references: readonly RealtimeReference[];
  selectedID: string | null;
  onSelect: (id: string | null) => void;
  onRetry: (id: string) => void;
  onAdd: () => void;
  visible: boolean;
  picking: boolean;
}) {
  const { t, locale } = useLocalization();
  const list = useRef<ComponentRef<typeof ScrollView>>(null);
  const currentOffset = useRef(0);

  const [width, setWidth] = useState(0);
  const [offset, setOffset] = useState(0);
  const contentWidth =
    Math.max(0, references.length * thumbnailStride - thumbnailGap) + 16;
  const selectedIndex = references.findIndex(item => item.id === selectedID);

  useEffect(() => {
    if (!visible || !width || !selectedID) return;

    if (selectedIndex < 0) return;

    const left = selectedIndex * thumbnailStride;
    const right = left + thumbnailSize + 4; // Include the selection border.
    const current = currentOffset.current;
    if (left >= current && right <= current + width) return;

    const next = Math.max(
      0,
      Math.min(contentWidth - width, left < current ? left : right - width),
    );
    if (Math.abs(next - current) < 0.5) return;

    // Only reveal offscreen selections (e.g. returning to a category). Animated
    // scrollTo makes RN ScrollView capture the next press to stop its animation.
    currentOffset.current = next;
    setOffset(next);
    list.current?.scrollTo({ x: next, animated: false });
  }, [visible, selectedID, selectedIndex, width, contentWidth]);

  return (
    <View style={[styles.row, !visible && styles.hidden]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('realtime.reference.add')}
        disabled={picking}
        onPress={onAdd}
        style={({ pressed }) => [styles.add, pressed && styles.pressed]}
      >
        <Image
          source={
            locale === 'zh-Hans'
              ? require('../assets/realtime/realtime_add_reference.png')
              : require('../assets/realtime/realtime_add_reference_en.png')
          }
          style={styles.image}
        />
      </Pressable>
      <View
        style={styles.listContainer}
        onLayout={event => setWidth(event.nativeEvent.layout.width)}
      >
        <ScrollView
          ref={list}
          horizontal
          keyboardShouldPersistTaps="handled"
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.items}
          scrollEventThrottle={16}
          onScroll={event => {
            currentOffset.current = event.nativeEvent.contentOffset.x;
            setOffset(currentOffset.current);
          }}
        >
          {(visible ? references : []).map(item => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={
                item.uploadState === 'failed'
                  ? t('realtime.reference.failedLabel', {
                      title: item.id.startsWith('custom-')
                        ? t('realtime.reference.custom')
                        : item.title,
                    })
                  : item.uploadState === 'uploading'
                  ? t('realtime.reference.uploadingLabel', {
                      title: item.id.startsWith('custom-')
                        ? t('realtime.reference.custom')
                        : item.title,
                    })
                  : item.id.startsWith('custom-')
                  ? t('realtime.reference.custom')
                  : item.title
              }
              accessibilityState={{
                selected: selectedID === item.id,
                busy: item.uploadState === 'uploading',
              }}
              onPress={() => {
                if (item.uploadState === 'failed') onRetry(item.id);
                else onSelect(selectedID === item.id ? null : item.id);
              }}
              style={({ pressed }) => [styles.item, pressed && styles.pressed]}
            >
              {selectedID === item.id && (
                <View pointerEvents="none" style={styles.selection} />
              )}
              <ReferenceThumbnail
                uri={item.iconURL}
                style={[styles.image, styles.thumbnail]}
              />
              <ReferenceUploadOverlay state={item.uploadState} />
            </Pressable>
          ))}
        </ScrollView>
        <EdgeFade left visible={offset > 0.5} />
        <EdgeFade visible={offset < contentWidth - width - 0.5} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { height: thumbnailSize, flexDirection: 'row', alignItems: 'center' },
  hidden: { display: 'none' },
  add: {
    width: thumbnailSize,
    height: thumbnailSize,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#303032',
    marginLeft: 14,
    marginRight: 8,
  },
  image: { width: thumbnailSize, height: thumbnailSize },
  thumbnail: { borderRadius: 10, backgroundColor: '#303032' },
  listContainer: { flex: 1, height: thumbnailSize + 4 },
  items: {
    paddingLeft: 2,
    paddingRight: 14,
    paddingVertical: 2,
    gap: thumbnailGap,
    alignItems: 'center',
  },
  item: { width: thumbnailSize, height: thumbnailSize },
  selection: {
    position: 'absolute',
    top: -2,
    bottom: -2,
    left: -2,
    right: -2,
    borderWidth: 2,
    borderRadius: 12,
    borderColor: '#FF2E88',
  },
  pressed: { opacity: 0.7 },
  fade: { position: 'absolute', top: 0, bottom: 0, width: 32 },
  leftFade: {
    left: 0,
    backgroundImage: 'linear-gradient(90deg, #101010, rgba(16,16,16,0))',
  },
  rightFade: {
    right: 0,
    backgroundImage: 'linear-gradient(90deg, rgba(16,16,16,0), #101010)',
  },
});
