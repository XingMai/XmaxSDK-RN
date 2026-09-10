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
 * Selection belongs to the parent. Selecting the same item clears it; a new
 * selection scrolls into the center of the visible list.
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
  const list = useRef<ComponentRef<typeof ScrollView>>(null);

  const [width, setWidth] = useState(0);
  const [offset, setOffset] = useState(0);
  const contentWidth = references.length * 60 - 10 + 16;
  const selectedIndex = references.findIndex(item => item.id === selectedID);

  useEffect(() => {
    if (!visible || !width || !selectedID) return;

    if (selectedIndex < 0) return;

    list.current?.scrollTo({
      x: Math.max(
        0,
        Math.min(contentWidth - width, selectedIndex * 60 + 27 - width / 2),
      ),
      animated: true,
    });
  }, [visible, selectedID, selectedIndex, width, contentWidth]);

  return (
    <View style={[styles.row, !visible && styles.hidden]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="添加参考图"
        disabled={picking}
        onPress={onAdd}
        style={({ pressed }) => [styles.add, pressed && styles.pressed]}
      >
        <Image
          source={require('../assets/realtime/realtime_add_reference.png')}
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
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.items}
          scrollEventThrottle={16}
          onScroll={event => setOffset(event.nativeEvent.contentOffset.x)}
        >
          {references.map(item => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={
                item.uploadState === 'failed'
                  ? `${item.title}，上传失败，点击重试`
                  : item.uploadState === 'uploading'
                  ? `${item.title}，正在上传`
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
              <Image
                source={{ uri: item.iconURL }}
                style={[styles.image, styles.thumbnail]}
                resizeMode="cover"
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
  row: { height: 50, flexDirection: 'row', alignItems: 'center' },
  hidden: { display: 'none' },
  add: {
    width: 50,
    height: 50,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#303032',
    marginLeft: 14,
    marginRight: 8,
  },
  image: { width: 50, height: 50 },
  thumbnail: { borderRadius: 10, backgroundColor: '#303032' },
  listContainer: { flex: 1, height: 54 },
  items: {
    paddingLeft: 2,
    paddingRight: 14,
    paddingVertical: 2,
    gap: 10,
    alignItems: 'center',
  },
  item: { width: 50, height: 50 },
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
