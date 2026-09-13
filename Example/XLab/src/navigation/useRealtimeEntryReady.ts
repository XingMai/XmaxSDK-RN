import { useLayoutEffect, useState } from 'react';

interface EntryNavigation {
  isFocused(): boolean;

  addListener(
    type: 'transitionEnd',
    listener: (event: { data: { closing: boolean } }) => void,
  ): () => void;
}

/**
 * Lets the native stack finish presenting the page before allocating media.
 * Readiness stays true after entry so a cancelled back gesture preserves preview.
 */
export function useRealtimeEntryReady(navigation: EntryNavigation): boolean {
  const [ready, setReady] = useState(false);

  useLayoutEffect(
    () =>
      navigation.addListener('transitionEnd', event => {
        if (!event.data.closing && navigation.isFocused()) setReady(true);
      }),
    [navigation],
  );

  return ready;
}
