import { FeedFeatureCard } from './FeedFeatureCard';
import { colors } from '../theme/tokens';

/** Displays the storage entry card and delegates navigation to its parent. */
export function StorageFeatureCard({ onPress }: { onPress: () => void }) {
  return (
    <FeedFeatureCard
      category="SDK SERVICE / STORAGE"
      watermark="URL"
      accentColor={colors.storage}
      icon={require('../assets/storage/upload.png')}
      iconLabel="UPLOAD"
      title="存储服务"
      subtitle="上传图片或视频，获取可复用的远程地址"
      tags={['IMAGE', 'VIDEO', 'REMOTE URL']}
      highlightedTag="REMOTE URL"
      onPress={onPress}
    />
  );
}
