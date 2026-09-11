import { useLocalization } from '../localization/LocalizationProvider';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  StyleSheet,
} from 'react-native';

/**
 * Covers the preview with XLab's original loading animation.
 *
 * Matches UIKit's 54 × 50 artwork, black scrim and 300 ms transitions. Interrupted
 * transitions resume from the current opacity; hidden artwork is unmounted so
 * its animation does not keep running. The overlay never intercepts touches.
 */
export function RealtimeLoadingOverlay({ loading }: { loading: boolean }) {
  const { t } = useLocalization();
  const opacity = useRef(new Animated.Value(0)).current;
  const [visible, setVisible] = useState(loading);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    if (loading) setVisible(true);

    let active = true;
    const transition = Animated.timing(opacity, {
      toValue: loading ? 1 : 0,
      duration: 300,
      easing: Easing.bezier(0.42, 0, 0.58, 1),
      useNativeDriver: true,
    });

    transition.start(({ finished }) => {
      if (active && finished && !loading) setVisible(false);
    });

    return () => {
      active = false;
      transition.stop();
    };
  }, [loading, opacity]);

  if (!visible) return null;

  return (
    <Animated.View
      pointerEvents="none"
      accessible={loading}
      accessibilityRole="progressbar"
      accessibilityLabel={t('common.loading')}
      style={[styles.overlay, { opacity }]}
    >
      {imageFailed ? (
        <ActivityIndicator size="small" color="rgba(255,255,255,0.86)" />
      ) : (
        <Image
          source={require('../assets/realtime/RealtimeLoading.gif')}
          resizeMode="contain"
          fadeDuration={0}
          onError={() => setImageFailed(true)}
          style={styles.image}
        />
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  image: { width: 54, height: 50 },
});
