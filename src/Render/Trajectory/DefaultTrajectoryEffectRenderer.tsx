import { monotonicTime } from '../../Foundation/Runtime/MonotonicTime';
import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useSyncExternalStore,
} from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import type {
  TrajectoryEffectRendering,
  TrajectoryID,
  TrajectoryPoint,
} from './TrajectoryEffectRendering';

interface Colors {
  core: string;
  glow: string;
}

interface Head {
  point: TrajectoryPoint;
  trailLocation: TrajectoryPoint['location'];
  colors: Colors;
  /** Bound only while mounted; input updates the native transform directly. */
  position?: Animated.ValueXY;
}

interface Segment {
  id: number;
  from: TrajectoryPoint['location'];
  to: TrajectoryPoint['location'];
  created: number;
  colors: Colors;
}

const trailLifetime = 64 / 60;
const finalOpacity = Math.pow(0.95, 64);

/**
 * White-core trails, colored glow, pulsing rings and orbit particles.
 * Native opacity/transform animations keep fading and idle effects off the JS
 * render loop. Heads follow input directly; trail additions coalesce once per
 * display frame. Network sampling remains independent. Override
 * colorsForTrajectory to customize the palette.
 */
export class DefaultTrajectoryEffectRenderer
  implements TrajectoryEffectRendering
{
  readonly view = (<TrajectoryEffectView renderer={this} />);
  private readonly heads = new Map<TrajectoryID, Head>();
  private readonly moved = new Map<TrajectoryID, TrajectoryPoint>();
  private segments: Segment[] = [];
  private frame: number | null = null;
  private expiry: ReturnType<typeof setTimeout> | null = null;
  private nextSegment = 0;
  private revision = 0;
  private readonly listeners = new Set<() => void>();

  /** Override to color new trajectories; sampling and network delivery are unaffected. */
  protected colorsForTrajectory(_id: TrajectoryID): Colors {
    return { core: '#FFFFFF', glow: '#00FF64' };
  }

  renderBegan(points: readonly TrajectoryPoint[]): void {
    for (const point of points)
      this.heads.set(point.id, {
        point,
        trailLocation: point.location,
        colors: this.colorsForTrajectory(point.id),
      });
    this.scheduleUpdate();
  }

  renderMoved(points: readonly TrajectoryPoint[]): void {
    for (const point of points) {
      const head = this.heads.get(point.id);
      if (!head) this.renderBegan([point]);
      else {
        head.point = point;
        head.position?.setValue(point.location);
        this.moved.set(point.id, point);
      }
    }
    this.scheduleUpdate();
  }

  renderEnded(identifiers: readonly TrajectoryID[]): void {
    // Keep the final pending segment even if release precedes the next frame.
    this.flushMoves();
    for (const id of identifiers) this.heads.delete(id);
    this.scheduleUpdate();
  }

  reset(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    if (this.expiry !== null) clearTimeout(this.expiry);
    this.frame = null;
    this.expiry = null;
    this.heads.clear();
    this.moved.clear();
    this.segments = [];
    this.publish();
  }

  /** Internal React subscription; consumers replace the renderer through its public contract. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): number => this.revision;

  /** Stable objects let React skip existing trails and head animation graphs. */
  content() {
    return (
      <>
        {this.segments.map(segment => (
          <TrailSegment key={segment.id} segment={segment} />
        ))}
        {[...this.heads.entries()].map(([id, head]) => (
          <TrajectoryHead key={id} head={head} />
        ))}
      </>
    );
  }

  private flushMoves(): void {
    for (const [id, point] of this.moved) {
      const head = this.heads.get(id);
      if (!head) continue;
      this.segments.push({
        id: ++this.nextSegment,
        from: head.trailLocation,
        to: point.location,
        created: point.timestamp,
        colors: head.colors,
      });
      head.trailLocation = point.location;
    }
    this.moved.clear();
    if (this.segments.length > 256) this.segments = this.segments.slice(-256);
    this.scheduleExpiry();
  }

  private scheduleUpdate(): void {
    if (this.frame !== null) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.flushMoves();
      this.publish();
    });
  }

  /** Batch expired-view removal; native animations handle the fade between cleanups. */
  private scheduleExpiry(): void {
    if (this.expiry !== null || !this.segments.length) return;
    const remaining =
      this.segments[0]!.created + trailLifetime - monotonicTime();
    this.expiry = setTimeout(() => {
      this.expiry = null;
      const now = monotonicTime();
      this.segments = this.segments.filter(
        segment => now - segment.created < trailLifetime,
      );
      this.publish();
      this.scheduleExpiry();
    }, Math.max(100, Math.ceil((remaining * 1000) / 100) * 100));
  }

  private publish(): void {
    this.revision++;
    for (const listener of this.listeners) listener();
  }
}

/** A segment is laid out once; its opacity is driven by the native animation loop. */
const TrailSegment = memo(function TrailSegmentView({
  segment,
}: {
  segment: Segment;
}) {
  const fade = useMemo(() => {
    const age = Math.min(
      trailLifetime,
      Math.max(0, monotonicTime() - segment.created),
    );
    return {
      opacity: new Animated.Value(Math.pow(0.95, age * 60)),
      duration: (trailLifetime - age) * 1000,
    };
  }, [segment]);
  useEffect(() => {
    const { opacity, duration } = fade;
    const decay = Math.pow(0.95, (duration / 1000) * 60);
    const animation = Animated.timing(opacity, {
      toValue: finalOpacity,
      duration,
      easing: t => (decay === 1 ? t : (1 - Math.pow(decay, t)) / (1 - decay)),
      useNativeDriver: true,
      isInteraction: false,
    });
    animation.start();
    return () => animation.stop();
  }, [fade]);
  const dx = segment.to.x - segment.from.x,
    dy = segment.to.y - segment.from.y;
  const length = Math.hypot(dx, dy);

  return (
    <Animated.View
      style={[
        styles.segment,
        {
          left: (segment.from.x + segment.to.x) / 2 - length / 2,
          top: (segment.from.y + segment.to.y) / 2 - 9,
          width: length + 3,
          opacity: fade.opacity,
          transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }],
          backgroundColor: segment.colors.glow + '38',
        },
      ]}
    >
      <View
        style={[styles.middle, { backgroundColor: segment.colors.glow + '85' }]}
      />
      <View style={[styles.core, { backgroundColor: segment.colors.core }]} />
    </Animated.View>
  );
});

/** A head mounts once per touch; movement updates values without rebuilding its animation graph. */
const TrajectoryHead = memo(function TrajectoryHeadView({
  head,
}: {
  head: Head;
}) {
  const position = useMemo(
    () => new Animated.ValueXY(head.point.location, { useNativeDriver: true }),
    [head],
  );
  const pulse = useMemo(() => new Animated.Value(0), []);
  const orbit = useMemo(() => new Animated.Value(0), []);
  useLayoutEffect(() => {
    // Input can advance between render and mount. Start at the latest location,
    // and never send native updates after this view has detached.
    head.position = position;
    position.setValue(head.point.location);
    return () => {
      if (head.position === position) delete head.position;
    };
  }, [head, position]);
  useEffect(() => {
    const pulseAnimation = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1000 / 1.2,
        easing: t => (1 - Math.cos(t * Math.PI * 2)) / 2,
        useNativeDriver: true,
        isInteraction: false,
      }),
    );
    const orbitAnimation = Animated.loop(
      Animated.timing(orbit, {
        toValue: 1,
        duration: ((Math.PI * 2) / 0.06) * 1000,
        easing: Easing.linear,
        useNativeDriver: true,
        isInteraction: false,
      }),
    );
    pulseAnimation.start();
    orbitAnimation.start();
    return () => {
      pulseAnimation.stop();
      orbitAnimation.stop();
    };
  }, [pulse, orbit]);

  return (
    <Animated.View
      style={[
        styles.head,
        {
          transform: position.getTranslateTransform(),
        },
      ]}
    >
      {[0, 1].map(index => {
        const radius = 22 + index * 18;
        return (
          <Animated.View
            key={index}
            style={[
              styles.ring,
              {
                left: -radius,
                top: -radius,
                width: radius * 2,
                height: radius * 2,
                borderRadius: radius,
                borderColor: head.colors.glow,
                opacity: pulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: index ? [0.4, 0.2] : [0.25, 0.5],
                }),
                transform: [
                  {
                    scale: pulse.interpolate({
                      inputRange: [0, 1],
                      outputRange: index
                        ? [1, (radius - 8) / radius]
                        : [(radius - 8) / radius, 1],
                    }),
                  },
                ],
              },
            ]}
          />
        );
      })}
      {[0, 1].map(group => (
        <Animated.View
          key={group}
          style={[
            styles.head,
            {
              transform: [
                {
                  rotate: orbit.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', group ? '-360deg' : '360deg'],
                  }),
                },
              ],
            },
          ]}
        >
          {[group, group + 2].map(index => (
            <Animated.View
              key={index}
              style={[
                styles.particle,
                {
                  left: Math.cos((index / 4) * Math.PI * 2) * 22 - 3,
                  top: Math.sin((index / 4) * Math.PI * 2) * 22 - 3,
                  backgroundColor: head.colors.glow,
                  opacity: pulse.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.12, 0.6],
                  }),
                },
              ]}
            />
          ))}
        </Animated.View>
      ))}
      <View
        style={[styles.headGlow, { backgroundColor: head.colors.glow + '8A' }]}
      />
      <View style={[styles.headCore, { backgroundColor: head.colors.core }]} />
    </Animated.View>
  );
});

/** Keeps touch-driven updates inside the effect instead of rerendering the video surface. */
function TrajectoryEffectView({
  renderer,
}: {
  renderer: DefaultTrajectoryEffectRenderer;
}) {
  useSyncExternalStore(renderer.subscribe, renderer.getSnapshot);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {renderer.content()}
    </View>
  );
}

const styles = StyleSheet.create({
  segment: { position: 'absolute', height: 18, borderRadius: 9 },
  middle: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 4,
    height: 10,
    borderRadius: 5,
  },
  core: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 7.5,
    height: 3,
    borderRadius: 1.5,
  },
  head: { position: 'absolute', left: 0, top: 0, width: 0, height: 0 },
  ring: { position: 'absolute', borderWidth: 2 },
  particle: { position: 'absolute', width: 6, height: 6, borderRadius: 3 },
  headGlow: {
    position: 'absolute',
    left: -12,
    top: -12,
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  headCore: {
    position: 'absolute',
    left: -5,
    top: -5,
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
