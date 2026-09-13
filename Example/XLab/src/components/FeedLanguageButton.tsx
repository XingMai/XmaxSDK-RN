import { useRef, useState, type ComponentRef } from 'react';
import {
  Keyboard,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { XLabLanguage } from '../localization/Localization';
import { useLocalization } from '../localization/LocalizationProvider';
import { colors } from '../theme/tokens';

/** Opens the iOS-style language choices from a 44-point globe button in the header. */
export function FeedLanguageButton({
  language,
  onChange,
}: {
  language: XLabLanguage;
  onChange: (language: XLabLanguage) => void;
}) {
  const { t } = useLocalization();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const anchor = useRef<ComponentRef<typeof View>>(null);
  const [position, setPosition] = useState<{
    top: number;
    right: number;
  } | null>(null);
  const options = [
    { value: 'system', title: t('language.system') },
    { value: 'zh-Hans', title: '简体中文' },
    { value: 'en', title: 'English' },
  ] as const;

  /** Dismisses text editing before presenting choices; does not recreate the feed. */
  function openMenu() {
    Keyboard.dismiss();
    anchor.current?.measureInWindow((x, y, anchorWidth, anchorHeight) => {
      setPosition({
        top: Math.max(
          insets.top,
          Math.min(y + anchorHeight, height - insets.bottom - 200),
        ),
        right: Math.max(18, width - x - anchorWidth),
      });
    });
  }

  return (
    <>
      <View ref={anchor} collapsable={false}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="语言 / Language"
          accessibilityValue={{
            text: options.find(item => item.value === language)?.title ?? '',
          }}
          accessibilityState={{ expanded: position !== null }}
          onPress={openMenu}
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        >
          <View accessible={false} style={styles.globe}>
            <View style={styles.meridian} />
            <View style={styles.equator} />
          </View>
        </Pressable>
      </View>
      <Modal
        transparent
        statusBarTranslucent
        navigationBarTranslucent
        visible={position !== null}
        animationType="fade"
        onRequestClose={() => setPosition(null)}
      >
        <View style={styles.overlay}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('language.dismiss')}
            style={StyleSheet.absoluteFill}
            onPress={() => setPosition(null)}
          />
          <View
            accessibilityViewIsModal
            style={[styles.menu, position, { maxWidth: width - 36 }]}
          >
            <Text accessibilityRole="header" style={styles.heading}>
              语言 / Language
            </Text>
            {options.map(option => (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityState={{ checked: language === option.value }}
                onPress={() => {
                  setPosition(null);
                  onChange(option.value);
                }}
                style={({ pressed }) => [
                  styles.option,
                  pressed && styles.highlighted,
                ]}
              >
                <Text style={styles.label}>{option.title}</Text>
                <Text accessible={false} style={styles.check}>
                  {language === option.value ? '✓' : ''}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.65 },
  globe: {
    width: 21,
    height: 21,
    borderRadius: 10.5,
    borderWidth: 1.5,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meridian: {
    position: 'absolute',
    width: 10,
    height: 19,
    borderRadius: 9.5,
    borderWidth: 1.2,
    borderColor: colors.accent,
  },
  equator: {
    position: 'absolute',
    width: 18,
    height: 1.2,
    backgroundColor: colors.accent,
  },
  overlay: { flex: 1 },
  menu: {
    position: 'absolute',
    width: 230,
    borderRadius: 14,
    backgroundColor: '#22282F',
    overflow: 'hidden',
    boxShadow: '0 8px 28px rgba(0,0,0,0.5)',
  },
  heading: {
    fontSize: 11,
    color: colors.secondary,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  option: {
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#FFFFFF20',
  },
  highlighted: { backgroundColor: '#FFFFFF14' },
  label: { flex: 1, fontSize: 13, color: colors.primary },
  check: { width: 24, textAlign: 'right', fontSize: 15, color: colors.accent },
});
