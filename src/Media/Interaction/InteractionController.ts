import { XmaxLogger } from '../../Foundation/Logging/XmaxLogger';
import type { RealtimeVideoFormat } from '../../Service/Realtime/RealtimeTypes';
import {
  mapInteractionPoint,
  type InteractionFrame,
  type InteractionPoint,
} from './InteractionCoordinateMapper';

/** Owns task-scoped interaction delivery; slow sends coalesce to the newest sample. */
export class InteractionController {
  private active: { taskID: string; format: RealtimeVideoFormat } | null = null;
  private pending: {
    points: readonly InteractionPoint[];
    isCurrent: (() => boolean) | undefined;
  } | null = null;
  private draining: number | null = null;
  private version = 0;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly send: (
      taskID: string,
      points: readonly InteractionPoint[],
    ) => void | Promise<void>,
  ) {}

  get generation(): number {
    return this.version;
  }

  get isActive(): boolean {
    return this.active !== null;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Starts only after task confirmation, replacing all samples from the previous task. */
  startInteraction(taskID: string, videoFormat: RealtimeVideoFormat): void {
    this.active = { taskID, format: { ...videoFormat } };
    this.invalidate();
  }

  /** Cancels unsent samples immediately, including while disconnect is waiting on other work. */
  stopInteraction(): void {
    this.active = null;
    this.invalidate();
  }

  submitInteraction(frame: InteractionFrame, generation: number): void {
    if (!this.active || generation !== this.version) return;

    const points = frame.points
      .map(point =>
        mapInteractionPoint(
          point,
          frame.viewportSize,
          this.active!.format,
          frame.contentMode,
        ),
      )
      .filter((point): point is InteractionPoint => point !== null);

    if (!points.length) return;
    this.pending = { points, isCurrent: frame.isCurrent };
    if (this.draining === generation) return;

    this.draining = generation;
    void this.drain(generation);
  }

  private invalidate(): void {
    this.version++;
    this.pending = null;
    this.draining = null;
    for (const listener of this.listeners) listener();
  }

  private async drain(generation: number): Promise<void> {
    // Defer once so a burst of UI samples cannot build a network queue.
    await Promise.resolve();
    while (generation === this.version && this.active && this.pending) {
      const sample = this.pending;
      this.pending = null;
      if (sample.isCurrent && !sample.isCurrent()) continue;
      try {
        await this.send(this.active.taskID, sample.points);
      } catch {
        XmaxLogger.interaction.warn(
          'Interaction sample delivery failed; sample dropped',
        );
      }
    }
    if (generation === this.version) this.draining = null;
  }
}
