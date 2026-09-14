import { useLayoutEffect, useRef, useState, type ComponentRef } from 'react';
import { findNodeHandle, StyleSheet, View } from 'react-native';
import NativeRuntime from '../../Foundation/Native/NativeXmaxRuntime';
import type {
  TrajectoryEffectRendering,
  TrajectoryID,
  TrajectoryPoint,
} from './TrajectoryEffectRendering';

interface Colors {
  core: string;
  glow: string;
}

interface NativePoint extends Colors {
  id: string;
  x: number;
  y: number;
}

type Command =
  | { action: 'begin' | 'move'; points: readonly NativePoint[] }
  | { action: 'end'; ids: readonly string[] }
  | { action: 'reset' | 'detach' };

let nextViewID = 0;

/**
 * Native canvas trails and breathing glow centered on each finger. Touch updates
 * cross the bridge once; fading and breathing run entirely on the native display
 * loop, without React segment views. Override colorsForTrajectory for a palette.
 */
export class DefaultTrajectoryEffectRenderer
  implements TrajectoryEffectRendering
{
  readonly view = (<TrajectoryEffectView renderer={this} />);
  private readonly points = new Map<TrajectoryID, NativePoint>();
  private send: ((command: Command) => void) | null = null;

  /** Override to color new fingers; sampling and network delivery are unaffected. */
  protected colorsForTrajectory(_id: TrajectoryID): Colors {
    return { core: '#FFFFFF', glow: '#00FF64' };
  }

  renderBegan(points: readonly TrajectoryPoint[]): void {
    const began = points.map(point => {
      const value = {
        id: point.id,
        x: point.location.x,
        y: point.location.y,
        ...this.colorsForTrajectory(point.id),
      };
      this.points.set(point.id, value);
      return value;
    });
    if (began.length) this.send?.({ action: 'begin', points: began });
  }

  renderMoved(points: readonly TrajectoryPoint[]): void {
    const moved: NativePoint[] = [];
    for (const point of points) {
      const previous = this.points.get(point.id);
      if (!previous) continue;
      const value = { ...previous, x: point.location.x, y: point.location.y };
      this.points.set(point.id, value);
      moved.push(value);
    }
    if (moved.length) this.send?.({ action: 'move', points: moved });
  }

  renderEnded(identifiers: readonly TrajectoryID[]): void {
    for (const id of identifiers) this.points.delete(id);
    this.send?.({ action: 'end', ids: identifiers });
  }

  reset(): void {
    this.points.clear();
    this.send?.({ action: 'reset' });
  }

  /** Installs one native canvas; catches touches received before its host mounted. */
  attach(send: (command: Command) => void): () => void {
    this.send?.({ action: 'detach' });
    this.send = send;
    send({ action: 'reset' });
    if (this.points.size)
      send({ action: 'begin', points: [...this.points.values()] });

    return () => {
      if (this.send !== send) return;
      send({ action: 'detach' });
      this.send = null;
      this.points.clear();
    };
  }
}

/** A stable, non-collapsible host bounds the native canvas in viewport units. */
function TrajectoryEffectView({
  renderer,
}: {
  renderer: DefaultTrajectoryEffectRenderer;
}) {
  const host = useRef<ComponentRef<typeof View>>(null);
  const [nativeID] = useState(() => `xmax-trajectory-${++nextViewID}`);
  useLayoutEffect(() => {
    const tag = findNodeHandle(host.current);
    if (typeof tag !== 'number') return;
    return renderer.attach(command =>
      NativeRuntime.renderTrajectory(tag, nativeID, JSON.stringify(command)),
    );
  }, [renderer, nativeID]);

  return (
    <View
      ref={host}
      nativeID={nativeID}
      collapsable={false}
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
    />
  );
}
