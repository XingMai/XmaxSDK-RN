import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { XmaxSDKInfo } from '@xmax/react-native-sdk';
import { colors } from '../theme/tokens';

/**
 * Displays the original bootstrap screen for checking the host setup.
 *
 * The main XLab navigation uses FeedScreen instead.
 */
export function HelloWorldScreen(): React.JSX.Element {
  return (
    <SafeAreaView style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.brand}>XMAX</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>XLAB</Text>
        </View>
      </View>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>REACT NATIVE</Text>
        <Text
          accessibilityRole="header"
          testID="hello-world"
          style={styles.title}
        >
          Hello World
        </Text>
        <Text style={styles.description}>XmaxSDK 工程已就绪</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>SDK</Text>
            <Text style={styles.value}>{XmaxSDKInfo.version}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.label}>React Native</Text>
            <Text style={styles.value}>0.87.1</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.label}>Platform</Text>
            <Text style={styles.value}>
              {Platform.OS === 'ios' ? 'iOS' : 'Android'}
            </Text>
          </View>
        </View>
      </View>
      <Text style={styles.footer}>XLab · React Native SDK Example</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 28 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 24,
  },
  brand: {
    color: colors.primary,
    fontSize: 23,
    fontWeight: '800',
    letterSpacing: 4,
  },
  badge: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 13,
    paddingVertical: 6,
  },
  badgeText: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
  },
  content: { flex: 1, justifyContent: 'center', paddingBottom: 30 },
  eyebrow: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 3,
    marginBottom: 16,
  },
  title: {
    color: colors.primary,
    fontSize: 44,
    fontWeight: '700',
    letterSpacing: -1.5,
  },
  description: {
    color: colors.secondary,
    fontSize: 16,
    marginTop: 12,
    marginBottom: 36,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 22,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 18,
  },
  label: { color: colors.secondary, fontSize: 14 },
  value: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  footer: {
    color: colors.secondary,
    fontSize: 11,
    textAlign: 'center',
    paddingBottom: 20,
    letterSpacing: 1,
  },
});
