import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

const orange = '#F5B86C';
const font = (size: number) => size * 1.15;

export function StorageFeatureCard({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="进入存储服务"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View pointerEvents="none" style={styles.glow} />
      <View pointerEvents="none" style={styles.stripe} />
      <Text accessible={false} style={styles.watermark}>
        URL
      </Text>
      <View style={styles.header}>
        <View style={styles.categoryRow}>
          <View style={styles.dot} />
          <Text style={styles.category} numberOfLines={1} adjustsFontSizeToFit>
            SDK SERVICE / STORAGE
          </Text>
        </View>
        <View style={styles.available}>
          <Text style={styles.availableText}>AVAILABLE</Text>
        </View>
      </View>
      <View style={styles.middle}>
        <View style={styles.iconTile}>
          <Image
            source={require('../assets/storage/upload.png')}
            style={styles.icon}
          />
          <Text style={styles.iconCaption}>UPLOAD</Text>
        </View>
        <View style={styles.description}>
          <Text style={styles.title}>存储服务</Text>
          <Text style={styles.subtitle}>
            上传图片或视频，获取可复用的远程地址
          </Text>
        </View>
        <View style={styles.enter}>
          <Text style={styles.enterText}>进入</Text>
        </View>
      </View>
      <View style={styles.tags}>
        {['IMAGE', 'VIDEO', 'REMOTE URL'].map(tag => (
          <View
            key={tag}
            style={[styles.tag, tag === 'REMOTE URL' && styles.highlightedTag]}
          >
            <Text
              style={[
                styles.tagText,
                tag === 'REMOTE URL' && styles.highlightedText,
              ]}
            >
              {tag}
            </Text>
          </View>
        ))}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.13)',
    backgroundImage:
      'linear-gradient(135deg, rgba(28,24,19,0.94), rgba(13,17,23,0.94), rgba(21,18,16,0.94))',
    boxShadow: '0 9px 20px rgba(0,0,0,0.52)',
    overflow: 'hidden',
  },
  pressed: { opacity: 0.75 },
  glow: {
    position: 'absolute',
    width: 126,
    height: 126,
    borderRadius: 63,
    right: -40,
    top: -52,
    backgroundColor: 'rgba(245,184,108,0.09)',
  },
  stripe: {
    position: 'absolute',
    left: 0,
    top: 47,
    width: 3,
    height: 54,
    borderRadius: 1.5,
    backgroundColor: orange,
  },
  watermark: {
    position: 'absolute',
    right: 16,
    bottom: -9,
    fontSize: font(45),
    fontWeight: '700',
    letterSpacing: -2,
    includeFontPadding: false,
    color: 'rgba(255,255,255,0.032)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  categoryRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: orange,
    boxShadow: '0 0 7px rgba(245,184,108,0.8)',
  },
  category: {
    flexShrink: 1,
    fontSize: font(9),
    fontWeight: '700',
    letterSpacing: 0.8,
    includeFontPadding: false,
    color: '#A99A8A',
  },
  available: {
    height: 25,
    paddingHorizontal: 10,
    justifyContent: 'center',
    borderRadius: 12.5,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.047)',
  },
  availableText: {
    fontSize: font(8),
    fontWeight: '700',
    letterSpacing: 0.7,
    includeFontPadding: false,
    color: orange,
  },
  middle: { flexDirection: 'row', alignItems: 'center', marginTop: 15 },
  iconTile: {
    width: 48,
    height: 48,
    marginRight: 13,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(245,184,108,0.28)',
    backgroundImage:
      'linear-gradient(135deg, rgba(245,184,108,0.28), rgba(27,23,18,0.28))',
    alignItems: 'center',
    paddingTop: 7,
  },
  icon: { width: 24, height: 22, resizeMode: 'contain' },
  iconCaption: {
    fontSize: font(6),
    fontWeight: '700',
    letterSpacing: 0.5,
    includeFontPadding: false,
    color: orange,
    marginTop: 1,
  },
  description: { flex: 1, gap: 5 },
  title: {
    fontSize: font(18),
    fontWeight: '700',
    includeFontPadding: false,
    color: '#F4F7FB',
  },
  subtitle: { fontSize: font(10), includeFontPadding: false, color: '#81786F' },
  enter: {
    width: 58,
    height: 34,
    borderRadius: 10,
    marginLeft: 10,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: orange,
  },
  enterText: {
    fontSize: font(11),
    fontWeight: '700',
    includeFontPadding: false,
    color: '#08110E',
  },
  tags: { flexDirection: 'row', gap: 7, marginTop: 14 },
  tag: {
    height: 24,
    paddingHorizontal: 9,
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    backgroundColor: 'rgba(8,12,18,0.4)',
  },
  highlightedTag: { backgroundColor: 'rgba(255,255,255,0.07)' },
  tagText: {
    fontSize: font(7),
    fontWeight: '700',
    includeFontPadding: false,
    color: '#A89A8B',
  },
  highlightedText: { color: orange },
});
