import { monotonicTime } from '../../Foundation/Runtime/MonotonicTime';
import {
  displayedFrame,
  type InteractionPoint,
  type InteractionFrame,
} from '../../Media/Interaction/InteractionCoordinateMapper';
import type {
  MediaSize,
  VideoContentMode,
} from '../../Service/Realtime/RealtimeTypes';
import type {
  TrajectoryEffectRendering,
  TrajectoryPoint,
} from './TrajectoryEffectRendering';
import { XmaxLogger } from '../../Foundation/Logging/XmaxLogger';

/** Native touch coordinates copied before the React event can be released. */
export interface TrajectoryTouch extends InteractionPoint {
  readonly identifier: string;
}

/** Multi-touch sampling shared by both video components; stationary fingers sample at 30 Hz too. */
export class TrajectorySampler {
  private readonly touches = new Map<string, TrajectoryPoint>();
  private nextID = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private disposed = false;
  private generation = 0;
  private readonly frame;

  constructor(
    private readonly viewport: MediaSize,
    video: MediaSize,
    private readonly mode: VideoContentMode,
    private readonly renderer: TrajectoryEffectRendering,
    private readonly submit: (frame: InteractionFrame) => void,
  ) {
    this.frame = displayedFrame(viewport, video, mode);
  }

  /** Fit black bars pass through; fill accepts the visible portion of the video. */
  contains(point: InteractionPoint): boolean {
    const frame = this.frame;

    return (
      !this.disposed &&
      !!frame &&
      Number.isFinite(point.x) &&
      Number.isFinite(point.y) &&
      point.x >= Math.max(0, frame.x) &&
      point.y >= Math.max(0, frame.y) &&
      point.x <= Math.min(this.viewport.width, frame.x + frame.width) &&
      point.y <= Math.min(this.viewport.height, frame.y + frame.height)
    );
  }

  begin(touches: readonly TrajectoryTouch[]): void {
    const began: TrajectoryPoint[] = [];
    for (const touch of touches) {
      if (this.touches.has(touch.identifier) || !this.contains(touch)) continue;
      const point = this.point(touch, `trajectory-${++this.nextID}`);
      this.touches.set(touch.identifier, point);
      began.push(point);
    }
    if (!began.length) return;

    this.render(() => this.renderer.renderBegan(began));
    this.sample();
    this.timer ??= setInterval(() => this.sample(), 1000 / 30);
  }

  move(touches: readonly TrajectoryTouch[]): void {
    if (this.disposed) return;
    const moved: TrajectoryPoint[] = [];
    for (const touch of touches) {
      const previous = this.touches.get(touch.identifier);
      if (!previous || !Number.isFinite(touch.x) || !Number.isFinite(touch.y))
        continue;
      const point = this.point(touch, previous.id);
      const dx = point.location.x - previous.location.x,
        dy = point.location.y - previous.location.y;
      if (dx * dx + dy * dy < 0.25) continue;
      this.touches.set(touch.identifier, point);
      moved.push(point);
    }
    if (moved.length) this.render(() => this.renderer.renderMoved(moved));
  }

  end(identifiers: readonly string[]): void {
    const ended: string[] = [];
    for (const identifier of identifiers) {
      const point = this.touches.get(identifier);
      if (point) ended.push(point.id);
      this.touches.delete(identifier);
    }
    if (ended.length) {
      this.generation++;
      this.render(() => this.renderer.renderEnded(ended));
    }
    if (!this.touches.size) this.stopTimer();
  }

  /** Reconciles the authoritative active-touch snapshot, including an incomplete end delta. */
  retainTouches(identifiers: readonly string[]): void {
    const active = new Set(identifiers);
    this.end([...this.touches.keys()].filter(id => !active.has(id)));
  }

  /** Ends the whole gesture immediately while allowing existing trails to fade normally. */
  release(): void {
    this.end([...this.touches.keys()]);
  }

  /** Cancels on background, geometry/renderer changes, task replacement and unmount. */
  dispose(): void {
    this.disposed = true;
    this.cancel();
  }

  /** A system gesture may cancel touches without permanently disabling this view. */
  cancel(): void {
    this.release();
    this.stopTimer();
    this.render(() => this.renderer.reset());
  }

  private point(touch: TrajectoryTouch, id: string): TrajectoryPoint {
    const frame = this.frame!;
    const x = Math.min(
      Math.max(touch.x, Math.max(0, frame.x)),
      Math.min(this.viewport.width, frame.x + frame.width),
    );
    const y = Math.min(
      Math.max(touch.y, Math.max(0, frame.y)),
      Math.min(this.viewport.height, frame.y + frame.height),
    );

    return {
      id,
      location: { x, y },
      normalizedLocation: {
        x: (x - frame.x) / frame.width,
        y: (y - frame.y) / frame.height,
      },
      timestamp: monotonicTime(),
    };
  }

  private sample(): void {
    if (this.disposed || !this.touches.size) return;
    const generation = this.generation;
    this.submit({
      isCurrent: () => !this.disposed && generation === this.generation,
      points: [...this.touches.values()].map(point => point.location),
      viewportSize: this.viewport,
      contentMode: this.mode,
    });
  }

  private stopTimer(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  private render(action: () => void): void {
    try {
      action();
    } catch {
      XmaxLogger.interaction.warn('Trajectory renderer callback failed');
    }
  }
}
