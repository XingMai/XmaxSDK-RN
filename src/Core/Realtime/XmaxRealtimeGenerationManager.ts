import type { InteractionController } from '../../Media/Interaction/InteractionController';
import { invalid } from '../../Foundation/Errors/XmaxError';
import { ensureActive } from '../../Foundation/Runtime/Async';
import { taskIDFromUUID } from '../../Foundation/Runtime/RuntimeInfo';
import type { RtcManager, RemoteStream } from '../../Foundation/RTC/RtcManager';
import type {
  RealtimeContext,
  RealtimeVideoFormat,
} from '../../Service/Realtime/RealtimeTypes';
import type { StreamController } from '../../Stream/StreamController';

/**
 * Tracks task identity and the last successful context across generation
 * updates.
 */
export class XmaxRealtimeGenerationManager {
  taskID: string | null = null;
  private context: RealtimeContext | null = null;

  constructor(
    private readonly rtc: RtcManager,
    private readonly stream: StreamController,
    private readonly interaction: InteractionController,
  ) {}

  /** Validates before allocating a connection or modifying the current task. */
  validateContext(context: RealtimeContext | null | undefined): void {
    if (!context && !this.context)
      throw invalid('A realtime context is required for the first generation');
  }

  async start(
    format: RealtimeVideoFormat,
    context: RealtimeContext | null | undefined,
    signal: AbortSignal,
  ): Promise<RemoteStream | null> {
    const resolved = context
      ? {
          prompt: context.prompt.trim(),
          referencePath: context.referencePath?.trim() || null,
        }
      : this.context;

    if (!resolved)
      throw invalid('A realtime context is required for the first generation');

    ensureActive(signal);
    if (this.taskID) {
      this.interaction.startInteraction(this.taskID, format);
      if (context) this.stream.updateGeneration(this.taskID, format, resolved);

      this.context = resolved;

      return null;
    }

    const taskID = taskIDFromUUID(this.rtc.randomUUID());

    this.taskID = taskID;

    try {
      const remote = await this.stream.beginGeneration(
        taskID,
        format,
        resolved,
        signal,
      );

      ensureActive(signal);
      this.context = resolved;
      this.interaction.startInteraction(taskID, format);

      return remote;
    } catch (error) {
      if (this.taskID === taskID) {
        try {
          this.stop();
        } catch {
          /* Preserve the original startup failure. */
        }
      }

      throw error;
    }
  }

  stop(): void {
    this.interaction.stopInteraction();
    const taskID = this.taskID;

    this.taskID = null;
    if (taskID) this.stream.stopGeneration(taskID);
  }

  reset(): void {
    this.context = null;
    this.stop();
  }
}
