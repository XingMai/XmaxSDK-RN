import { useEffect, useRef, useState, type ComponentProps } from 'react';
import {
  Alert,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { XmaxEnvironment, XmaxSDKInfo } from '@xmax/react-native-sdk';
import { colors } from '../theme/tokens';
import { StorageFeatureCard } from '../components/StorageFeatureCard';
import { FeedPipelineCard } from '../components/FeedPipelineCard';
import { FeedFeatureCard } from '../components/FeedFeatureCard';
import type { SavedConfiguration } from '../configuration/ConfigurationStore';

// Match FeedTypography.visualScale in the UIKit XLab reference.
const font = (size: number) => size * 1.15;

const environments = [
  { value: XmaxEnvironment.china, label: '国内' },
  { value: XmaxEnvironment.global, label: '海外' },
];

function FeedText({ style, ...props }: ComponentProps<typeof Text>) {
  return <Text {...props} style={[styles.text, style]} />;
}

function Pill({ text }: { text: string }) {
  return (
    <View style={styles.pill}>
      <FeedText style={styles.pillText}>{text}</FeedText>
    </View>
  );
}

async function openAPIKeyPage() {
  try {
    await Linking.openURL('https://platform.xmaxai.com/api-keys');
  } catch {
    Alert.alert('无法打开浏览器', '请访问 platform.xmaxai.com 申请 API Key。');
  }
}

/**
 * Displays SDK examples and passes the selected credentials and environment
 * to the chosen feature. Its parent owns secure persistence for each environment.
 */
export function FeedScreen({
  onCamera,
  onImage,
  onStorage,
  configuration,
  onAPIKeyChange,
  onEnvironmentChange,
  onRetrySave,
}: {
  onCamera: (apiKey: string, environment: XmaxEnvironment) => void;
  onImage: (
    apiKey: string,
    environment: XmaxEnvironment,
    fileURL: string,
  ) => void;
  onStorage: (apiKey: string, environment: XmaxEnvironment) => void;
  configuration: SavedConfiguration;
  onAPIKeyChange: (value: string) => void;
  onEnvironmentChange: (environment: XmaxEnvironment) => void;
  onRetrySave: () => void;
}) {
  const { environment } = configuration;
  const apiKey = configuration.keys[environment];
  const [visible, setVisible] = useState(false);

  const pickerOpen = useRef(false),
    mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
    };
  }, []);

  /** Selects an input image; the destination owns preparation and RTC resources. */
  async function openImage() {
    if (pickerOpen.current) return;
    if (!apiKey.trim()) {
      Alert.alert('请输入 API Key', '填写 API Key 后再选择图片。');
      return;
    }

    pickerOpen.current = true;
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        selectionLimit: 1,
        includeBase64: false,
        assetRepresentationMode: 'current',
      });

      if (!mounted.current || result.didCancel) return;
      if (result.errorCode)
        throw new Error(result.errorMessage || '无法读取所选图片');

      const fileURL = result.assets?.[0]?.uri;

      if (!fileURL) throw new Error('未获取到图片文件');
      onImage(apiKey.trim(), environment, fileURL);
    } catch (error) {
      if (mounted.current)
        Alert.alert(
          '无法选择图片',
          error instanceof Error ? error.message : '请重试',
        );
    } finally {
      pickerOpen.current = false;
    }
  }

  return (
    <View style={styles.page}>
      <View pointerEvents="none" style={styles.blueGlow} />
      <View pointerEvents="none" style={styles.mintGlow} />
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        <ScrollView
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false}
          automaticallyAdjustsScrollIndicatorInsets={false}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          <View style={styles.header}>
            <View style={styles.brandRow}>
              <View style={styles.brandMark} accessible={false}>
                <View style={styles.brandDiamond} />
                <FeedText style={styles.brandLetter}>X</FeedText>
              </View>
              <View style={styles.brandText}>
                <FeedText style={styles.brand}>XMAXSDK</FeedText>
                <FeedText style={styles.caption}>
                  EXAMPLE / REACT NATIVE
                </FeedText>
              </View>
            </View>
            <Pill text={`v${XmaxSDKInfo.version}`} />
          </View>

          <View style={styles.hero}>
            <View pointerEvents="none" style={styles.heroGlow} />
            <View style={styles.eyebrowRow}>
              <View style={styles.eyebrowLine} />
              <FeedText style={styles.eyebrow}>XMAX PLAYGROUND</FeedText>
            </View>
            <FeedText style={styles.title}>实时交互视频模型</FeedText>
            <FeedText style={styles.heroSubtitle}>
              选择输入源，启动 XmaxSDK 流式生成链路
            </FeedText>
          </View>

          <View style={styles.metrics}>
            {[
              ['RUNTIME', Platform.OS === 'ios' ? 'RN / iOS' : 'RN / Android'],
              ['MIN OS', Platform.OS === 'ios' ? '15.1+' : '8.0+'],
              ['LATEST MODEL', 'X2.0'],
            ].map(([label, value]) => (
              <View key={label} style={styles.metric}>
                <FeedText
                  style={styles.metricLabel}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.72}
                >
                  {label}
                </FeedText>
                <FeedText
                  style={styles.metricValue}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.72}
                >
                  {value}
                </FeedText>
              </View>
            ))}
          </View>

          <View style={styles.registry}>
            <View style={styles.row}>
              <FeedText style={styles.registryTitle}>选择你的模型</FeedText>
              <FeedText style={styles.modelCount}>1 MODELS</FeedText>
            </View>
            <View style={styles.apiContainer}>
              <View style={styles.row}>
                <FeedText style={styles.apiLabel}>API KEY</FeedText>
                <View style={styles.environments}>
                  {environments.map(({ value, label }) => (
                    <Pressable
                      key={value}
                      accessibilityRole="radio"
                      accessibilityLabel={`${label}环境`}
                      accessibilityState={{ checked: environment === value }}
                      onPress={() => {
                        setVisible(false);
                        onEnvironmentChange(value);
                      }}
                      hitSlop={{ top: 8, bottom: 8 }}
                      style={[
                        styles.environment,
                        environment === value && styles.environmentSelected,
                      ]}
                    >
                      <FeedText
                        style={[
                          styles.environmentText,
                          environment === value &&
                            styles.environmentTextSelected,
                        ]}
                      >
                        {label}
                      </FeedText>
                    </Pressable>
                  ))}
                </View>
              </View>
              <View style={styles.passwordField}>
                <TextInput
                  key={environment}
                  accessibilityLabel="API Key"
                  style={styles.input}
                  placeholder="输入 Xmax API Key"
                  placeholderTextColor="rgba(96,112,128,0.5)"
                  value={apiKey}
                  onChangeText={onAPIKeyChange}
                  secureTextEntry={!visible}
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  returnKeyType="done"
                  selectionColor={colors.accent}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={visible ? '隐藏 API Key' : '显示 API Key'}
                  onPress={() => setVisible(!visible)}
                  style={styles.visibilityButton}
                  hitSlop={10}
                >
                  <Image
                    style={styles.visibilityIcon}
                    source={
                      visible
                        ? require('../assets/feed/api_key_hidden.png')
                        : require('../assets/feed/api_key_visible.png')
                    }
                  />
                </Pressable>
              </View>
              <View style={styles.helpRow}>
                <FeedText style={styles.helpText}>还没有 API Key？</FeedText>
                <Pressable
                  accessibilityRole="link"
                  onPress={openAPIKeyPage}
                  hitSlop={6}
                >
                  <FeedText style={styles.helpLink}>
                    前往 Xmax 开放平台申请
                  </FeedText>
                </Pressable>
              </View>
              {configuration.error && (
                <View style={styles.helpRow}>
                  <FeedText
                    style={styles.helpText}
                    accessibilityLiveRegion="polite"
                  >
                    {configuration.error}
                  </FeedText>
                  <Pressable
                    accessibilityRole="button"
                    onPress={onRetrySave}
                    hitSlop={8}
                  >
                    <FeedText style={styles.helpLink}>重试</FeedText>
                  </Pressable>
                </View>
              )}
            </View>
            <View style={styles.divider} />
            <View style={styles.model}>
              <FeedText style={styles.modelDiamond}>◆</FeedText>
              <View style={styles.modelText}>
                <FeedText style={styles.modelTitle}>X2.0</FeedText>
                <FeedText style={styles.modelIdentifier}>
                  RealtimeModel.x2_0
                </FeedText>
              </View>
              <Pill text="ACTIVE" />
            </View>
          </View>

          <View style={styles.section}>
            <FeedText style={styles.sectionTitle}>
              GENERATION PIPELINES
            </FeedText>
            <FeedText style={styles.sectionSubtitle}>
              选择一种内容输入方式
            </FeedText>
          </View>
          <View style={styles.cards}>
            <FeedPipelineCard
              sequence="01"
              mode="MODE_01 / CAMERA"
              accentColor={colors.accent}
              title="摄像头实时流"
              subtitle="实时采集摄像头画面，持续驱动视频生成。"
              capability="createLocalCameraStream()"
              onPress={() => onCamera(apiKey.trim(), environment)}
            />
            <FeedPipelineCard
              sequence="02"
              mode="MODE_02 / IMAGE.FILE"
              accentColor={colors.image}
              title="图片生成管线"
              subtitle="选择本地图片，让静态画面持续流动起来。"
              capability="createLocalImageStream()"
              onPress={openImage}
            />
          </View>
          <View style={styles.section}>
            <FeedText style={styles.sectionTitle}>SDK FEATURES</FeedText>
            <FeedText style={styles.sectionSubtitle}>
              更多能力与接入示例
            </FeedText>
          </View>
          <View style={styles.cards}>
            <FeedFeatureCard
              category="SDK RENDERING / TRAJECTORY"
              watermark="FX"
              accentColor={colors.trajectory}
              icon={require('../assets/feed/trajectory.png')}
              iconLabel="RENDER"
              title="自定义轨迹渲染"
              subtitle="使用自定义 Renderer 绘制交互轨迹。"
              tags={['CANVAS', 'MULTI-TOUCH', 'CUSTOM EFFECT']}
              highlightedTag="CUSTOM EFFECT"
            />
            <StorageFeatureCard
              onPress={() => onStorage(apiKey.trim(), environment)}
            />
          </View>
          <View style={styles.footer}>
            <View style={styles.footerDivider} />
            <FeedText style={styles.copyright}>
              Copyright © 2026 XMAX.AI PTE. LTD. All rights reserved.
            </FeedText>
            <FeedText style={styles.email}>sdk@xmax.ai</FeedText>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  text: { includeFontPadding: false },
  page: {
    flex: 1,
    backgroundColor: colors.background,
    backgroundImage: 'linear-gradient(145deg, #0C121B, #070A0F, #090D13)',
  },
  safeArea: { flex: 1 },
  blueGlow: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    right: -135,
    top: -55,
    backgroundColor: 'rgba(75,123,255,0.14)',
    boxShadow: '0 0 70px rgba(75,123,255,0.14)',
  },
  mintGlow: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    left: -145,
    top: 330,
    backgroundColor: 'rgba(77,240,181,0.12)',
    boxShadow: '0 0 75px rgba(77,240,181,0.12)',
  },
  content: { paddingHorizontal: 18, paddingTop: 20, paddingBottom: 32 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 34,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  brandMark: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandDiamond: {
    position: 'absolute',
    width: 25,
    height: 25,
    borderRadius: 8,
    transform: [{ rotate: '45deg' }],
    backgroundImage: 'linear-gradient(135deg, #8EF0C8, #6495FF)',
  },
  brandLetter: { fontSize: font(12), fontWeight: '700', color: '#07110D' },
  brandText: { gap: 3 },
  brand: {
    fontSize: font(15),
    fontWeight: '700',
    letterSpacing: 1.8,
    color: '#F2F4F7',
  },
  caption: {
    fontSize: font(8),
    letterSpacing: 1,
    color: 'rgba(255,255,255,0.38)',
  },
  pill: {
    height: 26,
    paddingHorizontal: 11,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(142,240,200,0.086)',
    justifyContent: 'center',
  },
  pillText: {
    fontSize: font(9),
    fontWeight: '700',
    letterSpacing: 0.8,
    color: colors.accent,
  },
  hero: {
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundImage:
      'linear-gradient(135deg, rgba(20,29,40,0.88), rgba(12,17,24,0.82))',
    boxShadow: '0 10px 24px rgba(0,0,0,0.52)',
    overflow: 'hidden',
  },
  heroGlow: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    right: -36,
    bottom: -42,
    backgroundColor: 'rgba(104,149,255,0.08)',
    boxShadow: '0 0 28px rgba(104,149,255,0.08)',
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 18,
  },
  eyebrowLine: {
    width: 22,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.accent,
  },
  eyebrow: {
    fontSize: font(9),
    fontWeight: '700',
    color: colors.accent,
    letterSpacing: 1.2,
  },
  title: {
    fontSize: font(24),
    fontWeight: '700',
    letterSpacing: -0.3,
    color: '#F5F7FB',
    marginBottom: 12,
  },
  heroSubtitle: { fontSize: font(12), color: '#91A0B2' },
  metrics: { flexDirection: 'row', gap: 8, marginTop: 12, marginBottom: 14 },
  metric: {
    flex: 1,
    height: 66,
    justifyContent: 'center',
    paddingLeft: 12,
    paddingRight: 10,
    gap: 7,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    backgroundColor: 'rgba(14,20,28,0.7)',
  },
  metricLabel: {
    fontSize: font(8),
    fontWeight: '700',
    color: 'rgba(255,255,255,0.38)',
    letterSpacing: 1,
  },
  metricValue: { fontSize: font(12), fontWeight: '700', color: '#E8EDF5' },
  registry: {
    padding: 18,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: 'rgba(142,240,200,0.15)',
    backgroundImage:
      'linear-gradient(135deg, rgba(18,27,25,0.91), rgba(13,18,24,0.91))',
    boxShadow: '0 8px 18px rgba(0,0,0,0.52)',
  },
  registryTitle: { fontSize: font(13), fontWeight: '700', color: '#E9EDF3' },
  modelCount: {
    fontSize: font(8),
    color: 'rgba(255,255,255,0.44)',
    letterSpacing: 0.8,
  },
  apiContainer: {
    marginTop: 14,
    padding: 10,
    paddingBottom: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    backgroundColor: 'rgba(8,12,18,0.26)',
  },
  apiLabel: {
    fontSize: font(8),
    fontWeight: '700',
    letterSpacing: 0.9,
    color: '#7E8A9A',
  },
  environments: { flexDirection: 'row', gap: 4 },
  environment: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  environmentSelected: {
    backgroundColor: 'rgba(142,240,200,0.086)',
    borderColor: 'rgba(142,240,200,0.16)',
  },
  environmentText: { fontSize: font(8), color: '#7E8A9A' },
  environmentTextSelected: { color: colors.accent },
  passwordField: {
    height: 40,
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.11)',
    backgroundColor: 'rgba(8,12,18,0.4)',
  },
  input: {
    flex: 1,
    minWidth: 0,
    height: '100%',
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 0,
    fontSize: font(10),
    includeFontPadding: false,
    color: '#D6DEE9',
  },
  visibilityButton: { width: 20, height: 20, marginRight: 8 },
  visibilityIcon: { width: 20, height: 20, opacity: 0.78 },
  helpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 7,
  },
  helpText: { fontSize: font(9), color: 'rgba(112,128,144,0.6)' },
  helpLink: { fontSize: font(9), color: 'rgba(142,240,200,0.63)' },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.09)',
    marginTop: 12,
    marginBottom: 4,
  },
  model: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 10,
    paddingRight: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(142,240,200,0.16)',
    backgroundColor: 'rgba(142,240,200,0.063)',
  },
  modelDiamond: { fontSize: font(7), color: colors.accent },
  modelText: { flex: 1, gap: 3 },
  modelTitle: { fontSize: font(13), fontWeight: '700', color: '#F0F2F5' },
  modelIdentifier: { fontSize: font(8), color: 'rgba(255,255,255,0.44)' },
  section: { gap: 5, marginTop: 30, marginBottom: 14 },
  sectionTitle: {
    fontSize: font(10),
    fontWeight: '700',
    letterSpacing: 1.1,
    color: '#C6D0DD',
  },
  sectionSubtitle: { fontSize: font(11), color: '#667384' },
  cards: { gap: 14 },
  footer: { alignItems: 'center', marginTop: 10, paddingBottom: 32 },
  footerDivider: {
    width: 36,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.09)',
    marginBottom: 18,
  },
  copyright: {
    fontSize: font(9),
    color: 'rgba(255,255,255,0.31)',
    textAlign: 'center',
  },
  email: {
    fontSize: font(9),
    color: 'rgba(142,240,200,0.41)',
    letterSpacing: 0.4,
    marginTop: 7,
  },
});
