import { FeedFeatureCard } from './FeedFeatureCard';
import { useLocalization } from '../localization/LocalizationProvider';
import { colors } from '../theme/tokens';

/** Displays the storage entry card and delegates navigation to its parent. */
export function StorageFeatureCard({ onPress }: { onPress: () => void }) {
  const { t } = useLocalization();

  return (
    <FeedFeatureCard
      category="SDK SERVICE / STORAGE"
      watermark="URL"
      accentColor={colors.storage}
      icon={require('../assets/storage/upload.png')}
      iconLabel="UPLOAD"
      title={t('feed.storage.title')}
      subtitle={t('feed.storage.subtitle')}
      tags={['IMAGE', 'VIDEO', 'REMOTE URL']}
      highlightedTag="REMOTE URL"
      onPress={onPress}
    />
  );
}
