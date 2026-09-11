import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  AppState,
  View,
  StyleSheet,
  type GestureResponderEvent,
} from 'react-native';
import type { VideoBinding } from '../RenderController';
import type { VideoContentMode } from '../../Service/Realtime/RealtimeTypes';
import type { TrajectoryEffectRendering } from './TrajectoryEffectRendering';
import { DefaultTrajectoryEffectRenderer } from './DefaultTrajectoryEffectRenderer';
import { TrajectorySampler } from './TrajectorySampler';

/** One passive renderer plus SDK-owned responders for a confirmed remote binding. */
export function TrajectoryOverlay({
  binding,
  contentMode,
  renderer: requested,
}: {
  binding: VideoBinding;
  contentMode: VideoContentMode;
  renderer?: TrajectoryEffectRendering | null | undefined;
}) {
  const interaction = binding.interaction!;
  const generation = useSyncExternalStore(
    interaction.subscribe,
    () => interaction.generation,
  );
  const subscribe = useCallback(
    (listener: () => void) => {
      binding.listeners.add(listener);

      return () => {
        binding.listeners.delete(listener);
      };
    },
    [binding],
  );
  useSyncExternalStore(subscribe, () => binding.version);
  const fallback = useMemo(() => new DefaultTrajectoryEffectRenderer(), []);
  const renderer = requested ?? fallback;
  const [size, setSize] = useState({ width: 0, height: 0 });
  const sampler = useRef<TrajectorySampler | null>(null);

  useLayoutEffect(() => {
    if (
      !binding.valid ||
      !binding.confirmed ||
      !interaction.isActive ||
      !size.width ||
      !size.height
    )
      return;

    const current = new TrajectorySampler(
      size,
      binding.format,
      contentMode,
      renderer,
      frame => {
        if (binding.valid && binding.confirmed)
          interaction.submitInteraction(frame, generation);
      },
    );
    sampler.current = current;
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'background') {
        current.dispose();
        sampler.current = null;
      }
    });

    return () => {
      subscription.remove();
      sampler.current = null;
      current.dispose();
    };
  }, [
    binding,
    binding.valid,
    binding.confirmed,
    binding.format.width,
    binding.format.height,
    interaction,
    generation,
    contentMode,
    renderer,
    size,
  ]);

  return (
    <View
      collapsable={false}
      style={StyleSheet.absoluteFill}
      onLayout={({ nativeEvent: { layout } }) =>
        setSize(current =>
          current.width === layout.width && current.height === layout.height
            ? current
            : { width: layout.width, height: layout.height },
        )
      }
      onStartShouldSetResponder={event =>
        !!sampler.current?.contains({
          x: event.nativeEvent.locationX,
          y: event.nativeEvent.locationY,
        })
      }
      onResponderGrant={event => sampler.current?.begin(touches(event))}
      onResponderStart={event => sampler.current?.begin(touches(event))}
      onResponderMove={event => sampler.current?.move(touches(event))}
      onResponderEnd={event =>
        sampler.current?.end(touches(event).map(touch => touch.identifier))
      }
      onResponderTerminationRequest={() => true}
      onResponderTerminate={() => sampler.current?.cancel()}
    >
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {renderer.view}
      </View>
    </View>
  );
}

/** Copies only changed touches, preserving each native finger identifier. */
function touches(event: GestureResponderEvent) {
  return event.nativeEvent.changedTouches.map(touch => ({
    identifier: String(touch.identifier),
    x: touch.locationX,
    y: touch.locationY,
  }));
}
