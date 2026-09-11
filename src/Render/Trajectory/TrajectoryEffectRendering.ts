import type { ReactElement } from 'react';
import type { InteractionPoint } from '../../Media/Interaction/InteractionCoordinateMapper';

/** Stable for one finger from touch-down until release or cancellation. */
export type TrajectoryID = string;

/** Visual input in viewport units; normalizedLocation is relative to the full displayed video. */
export interface TrajectoryPoint {
  readonly id: TrajectoryID;
  readonly location: InteractionPoint;
  readonly normalizedLocation: InteractionPoint;
  /** Monotonic time in seconds, matching the iOS renderer contract. */
  readonly timestamp: number;
}

/**
 * Replaces visual effects only. SDK sampling, coordinate mapping and tracks delivery
 * remain independent. Give each mounted video its own renderer instance.
 */
export interface TrajectoryEffectRendering {
  /** Passive React content installed above the video; SDK owns touch handling. */
  readonly view: ReactElement;

  renderBegan(points: readonly TrajectoryPoint[]): void;

  renderMoved(points: readonly TrajectoryPoint[]): void;

  renderEnded(identifiers: readonly TrajectoryID[]): void;

  /** Releases animation resources and removes all visible trajectories. Must be reusable. */
  reset(): void;
}
