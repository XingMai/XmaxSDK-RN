import { useMemo, type ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/tokens';

const font = (size: number) => size * 1.15;

/** Content and availability of an input pipeline on the XLab home screen. */
interface FeedPipelineCardProps {
  sequence: string;
  mode: string;
  /** Six-digit hex color from the iOS Feed palette. */
  accentColor: string;
  title: string;
  subtitle: string;
  capability: string;
  /** Omit until the pipeline is implemented; the card then shows a disabled state. */
  onPress?: () => void;
}

function FeedText({ style, ...props }: ComponentProps<typeof Text>) {
  return <Text {...props} style={[styles.text, style]} />;
}

/** Displays an iOS-aligned pipeline card without owning media or navigation. */
export function FeedPipelineCard({
  sequence,
  mode,
  accentColor,
  title,
  subtitle,
  capability,
  onPress,
}: FeedPipelineCardProps) {
  const accent = useMemo(
    () =>
      StyleSheet.create({
        background: { backgroundColor: accentColor },
        text: { color: accentColor },
        glow: { backgroundColor: `${accentColor}1A` },
        dot: {
          backgroundColor: accentColor,
          boxShadow: `0 0 7px ${accentColor}CC`,
        },
      }),
    [accentColor],
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}，${onPress ? '运行' : '待接入'}`}
      accessibilityState={{ disabled: !onPress }}
      disabled={!onPress}
      style={({ pressed }) => [styles.pipeline, pressed && styles.pressed]}
      onPress={onPress}
    >
      <View pointerEvents="none" style={[styles.pipelineGlow, accent.glow]} />
      <View
        pointerEvents="none"
        style={[styles.pipelineStripe, accent.background]}
      />
      <FeedText accessible={false} style={styles.sequence}>
        {sequence}
      </FeedText>
      <View style={styles.row}>
        <View style={styles.modeRow}>
          <View style={[styles.modeDot, accent.dot]} />
          <FeedText style={styles.mode} numberOfLines={1} adjustsFontSizeToFit>
            {mode}
          </FeedText>
        </View>
        <View style={styles.ready}>
          <View style={[styles.readyDot, accent.background]} />
          <FeedText style={[styles.pillText, accent.text]}>
            {onPress ? 'READY' : '待接入'}
          </FeedText>
        </View>
      </View>
      <FeedText style={styles.pipelineTitle}>{title}</FeedText>
      <FeedText style={styles.pipelineSubtitle}>{subtitle}</FeedText>
      <View style={styles.actions}>
        <View style={styles.capabilityBox}>
          <FeedText
            style={styles.capability}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.78}
          >
            {capability}
          </FeedText>
        </View>
        <View style={[styles.runButton, accent.background]}>
          <FeedText style={styles.runText}>
            {onPress ? '运行' : '待接入'}
          </FeedText>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  text: { includeFontPadding: false },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  pillText: { fontSize: font(9), fontWeight: '700', letterSpacing: 0.8 },
  pipeline: {
    paddingHorizontal: 18,
    paddingVertical: 17,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.13)',
    backgroundImage:
      'linear-gradient(135deg, rgba(20,27,37,0.94), rgba(12,17,24,0.94))',
    boxShadow: '0 9px 20px rgba(0,0,0,0.52)',
    overflow: 'hidden',
  },
  pipelineGlow: {
    position: 'absolute',
    width: 112,
    height: 112,
    borderRadius: 56,
    right: -38,
    top: -46,
  },
  pipelineStripe: {
    position: 'absolute',
    left: 0,
    top: 22,
    width: 3,
    height: 70,
    borderRadius: 1.5,
  },
  sequence: {
    position: 'absolute',
    right: 17,
    top: 5,
    fontSize: font(54),
    fontWeight: '700',
    color: 'rgba(255,255,255,0.032)',
  },
  modeRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  modeDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  mode: {
    flexShrink: 1,
    fontSize: font(9),
    fontWeight: '700',
    color: '#9AA7B7',
    letterSpacing: 0.8,
  },
  ready: {
    height: 25,
    paddingHorizontal: 9,
    borderRadius: 12.5,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    backgroundColor: 'rgba(255,255,255,0.047)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  readyDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  pipelineTitle: {
    fontSize: font(21),
    fontWeight: '700',
    color: colors.primary,
    marginTop: 17,
    marginBottom: 7,
  },
  pipelineSubtitle: {
    fontSize: font(12),
    lineHeight: 18,
    color: colors.secondary,
  },
  actions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  capabilityBox: {
    flex: 1,
    height: 36,
    justifyContent: 'center',
    paddingLeft: 11,
    paddingRight: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.086)',
    backgroundColor: 'rgba(8,12,18,0.4)',
  },
  capability: { fontSize: font(9), fontWeight: '500', color: '#B8C3D1' },
  runButton: {
    width: 82,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    boxShadow: '0 4px 10px rgba(0,0,0,0.25)',
  },
  runText: { fontSize: font(11), fontWeight: '700', color: '#08110E' },
  pressed: { opacity: 0.75 },
});
