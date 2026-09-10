import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { RealtimeReferenceUploadState } from './RealtimeReferenceCatalog';

/**
 * Displays per-image upload feedback without covering the camera preview.
 */
export function ReferenceUploadOverlay({
  state,
  compact = false,
}: {
  state: RealtimeReferenceUploadState;
  compact?: boolean;
}) {
  if (state === 'ready') return null;

  return (
    <View
      pointerEvents="none"
      style={[styles.overlay, compact && styles.compactOverlay]}
    >
      {state === 'uploading' ? (
        <ActivityIndicator
          color="#FFF"
          size="small"
          style={compact ? styles.compactIndicator : styles.indicator}
        />
      ) : (
        <Text style={[styles.retry, compact && styles.compactRetry]}>↻</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: '#0000006B',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  compactOverlay: { borderRadius: 14 },
  indicator: { transform: [{ scale: 0.8 }] },
  compactIndicator: { transform: [{ scale: 0.65 }] },
  retry: {
    color: '#FFF',
    fontSize: 22,
    fontWeight: '600',
    includeFontPadding: false,
  },
  compactRetry: { fontSize: 16 },
});
