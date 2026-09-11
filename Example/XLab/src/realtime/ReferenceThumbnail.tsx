import { useEffect, useState } from 'react';
import { Image, type ImageStyle, type StyleProp } from 'react-native';
import { ReferenceImageCache } from './ReferenceImageCache';
import { realtimeReferences } from './RealtimeReferenceCatalog';

const cache = new ReferenceImageCache(
  new Set(realtimeReferences.map(reference => reference.iconURL)),
);

/** Renders catalog images from disk; local picker thumbnails remain direct file reads. */
export function ReferenceThumbnail({
  uri,
  style,
}: {
  uri: string;
  style: StyleProp<ImageStyle>;
}) {
  const [resolved, setResolved] = useState<{
    original: string;
    cached: string;
  } | null>(null);
  const cached =
    resolved?.original === uri
      ? resolved.cached
      : cache.peek(uri) ?? (/^https?:\/\//i.test(uri) ? undefined : uri);

  useEffect(() => {
    let active = true;

    // Let a shared catalog download finish even if this thumbnail leaves the page.
    void cache
      .resolve(uri)
      .catch(() => uri)
      .then(value => {
        if (active) setResolved({ original: uri, cached: value });
      });

    return () => {
      active = false;
    };
  }, [uri]);

  return (
    <Image
      source={cached ? { uri: cached } : undefined}
      style={style}
      resizeMode="cover"
      resizeMethod="resize"
      fadeDuration={0}
      onError={() => {
        if (cached && cached !== uri) {
          void cache.invalidate(uri);
          setResolved({ original: uri, cached: uri });
        }
      }}
    />
  );
}
