import type { ComponentProps } from 'react';
import { RealtimeScreen } from './RealtimeScreen';

/** Camera entry point for the shared realtime screen and its media lifecycle. */
export function CameraScreen(
  props: Omit<ComponentProps<typeof RealtimeScreen>, 'fileURL'>,
) {
  return <RealtimeScreen {...props} />;
}
