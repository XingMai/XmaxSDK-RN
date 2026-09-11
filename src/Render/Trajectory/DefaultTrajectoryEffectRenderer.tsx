import { monotonicTime } from '../../Foundation/Runtime/MonotonicTime';
import { useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';
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
  started: number;
  colors: Colors;
}

interface Segment {
  id: number;
  from: TrajectoryPoint['location'];
  to: TrajectoryPoint['location'];
  created: number;
  colors: Colors;
}

/**
 * SDK green glow, white core, pulsing rings and orbit particles.
 * Uses bounded RN drawing primitives, with no pixel transfer or extra native dependency.
 * The fade follows the iOS 0.95-per-frame decay at 60 Hz.
 */
export class DefaultTrajectoryEffectRenderer
  implements TrajectoryEffectRendering
{
  readonly view = (<TrajectoryEffectView renderer={this} />);
  private readonly heads = new Map<TrajectoryID, Head>();
  private segments: Segment[] = [];
  private frame: number | null = null;
  private nextSegment = 0;
  private revision = 0;
  private now = 0;
  private readonly listeners = new Set<() => void>();

  /** Override to color new trajectories; sampling and network delivery are unaffected. */
  protected colorsForTrajectory(_id: TrajectoryID): Colors {
    return { core: '#FFFFFF', glow: '#00FF64' };
  }

  renderBegan(points: readonly TrajectoryPoint[]): void {
    for (const point of points)
      this.heads.set(point.id, {
        point,
        started: point.timestamp,
        colors: this.colorsForTrajectory(point.id),
      });
    this.animate();
  }

  renderMoved(points: readonly TrajectoryPoint[]): void {
    for (const point of points) {
      const head = this.heads.get(point.id);
      if (!head) {
        this.renderBegan([point]);
        continue;
      }
      this.segments.push({
        id: ++this.nextSegment,
        from: head.point.location,
        to: point.location,
        created: point.timestamp,
        colors: head.colors,
      });
      head.point = point;
    }
    // Bound native view count even during unusually dense multi-touch input.
    if (this.segments.length > 256) this.segments = this.segments.slice(-256);
    this.animate();
  }

  renderEnded(identifiers: readonly TrajectoryID[]): void {
    for (const id of identifiers) this.heads.delete(id);
    this.animate();
  }

  reset(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.heads.clear();
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

  /** Produces passive drawing primitives; no responder handlers belong to a renderer. */
  content() {
    return (
      <>
        {this.segments.map(segment => {
          const dx = segment.to.x - segment.from.x,
            dy = segment.to.y - segment.from.y;
          const length = Math.hypot(dx, dy);
          const opacity = Math.pow(
            0.95,
            Math.max(0, this.now - segment.created) * 60,
          );

          return (
            <View
              key={segment.id}
              style={[
                styles.segment,
                {
                  left: (segment.from.x + segment.to.x) / 2 - length / 2,
                  top: (segment.from.y + segment.to.y) / 2 - 9,
                  width: length + 3,
                  opacity,
                  transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }],
                  backgroundColor: segment.colors.glow + '38',
                  boxShadow: `0 0 12px ${segment.colors.glow}66`,
                },
              ]}
            >
              <View
                style={[
                  styles.middle,
                  { backgroundColor: segment.colors.glow + '85' },
                ]}
              />
              <View
                style={[styles.core, { backgroundColor: segment.colors.core }]}
              />
            </View>
          );
        })}
        {[...this.heads.entries()].map(([id, head]) => {
          const elapsed = this.now - head.started,
            { x, y } = head.point.location;

          return (
            <View key={id} style={[styles.head, { left: x, top: y }]}>
              {[0, 1].map(index => {
                const pulse =
                  (Math.sin((elapsed * 1.2 + index * 0.5) * Math.PI * 2) + 1) /
                  2;
                const radius = 14 + index * 18 + pulse * 8;

                return (
                  <View
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
                        opacity: 0.5 * (1 - index * 0.2) * (0.5 + pulse * 0.5),
                      },
                    ]}
                  />
                );
              })}
              {[0, 1, 2, 3].map(index => {
                const angle =
                  (index / 4) * Math.PI * 2 +
                  elapsed * 0.06 * (index % 2 ? -1 : 1);

                return (
                  <View
                    key={index}
                    style={[
                      styles.particle,
                      {
                        left: Math.cos(angle) * 22 - 3,
                        top: Math.sin(angle) * 22 - 3,
                        backgroundColor: head.colors.glow,
                        opacity:
                          0.6 * (0.6 + Math.sin(elapsed * 3 + index) * 0.4),
                        boxShadow: `0 0 6px ${head.colors.glow}`,
                      },
                    ]}
                  />
                );
              })}
              <View
                style={[
                  styles.headGlow,
                  {
                    backgroundColor: head.colors.glow + '8A',
                    boxShadow: `0 0 12px ${head.colors.glow}`,
                  },
                ]}
              />
              <View
                style={[styles.headCore, { backgroundColor: head.colors.core }]}
              />
            </View>
          );
        })}
      </>
    );
  }

  private animate(): void {
    if (this.frame !== null) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.now = monotonicTime();
      this.segments = this.segments.filter(
        segment => this.now - segment.created <= 64 / 60,
      );
      this.publish();
      if (this.heads.size || this.segments.length) this.animate();
    });
  }

  private publish(): void {
    this.revision++;
    for (const listener of this.listeners) listener();
  }
}

/** Keeps animation updates inside the effect instead of rerendering the video surface. */
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
  head: { position: 'absolute', width: 0, height: 0 },
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
