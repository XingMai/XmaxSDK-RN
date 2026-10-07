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
    if (context) validateBitrateRange(context);
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
          minimumBitrate: context.minimumBitrate ?? null,
          maximumBitrate: context.maximumBitrate ?? null,
        }
      : this.context;

    if (!resolved)
      throw invalid('A realtime context is required for the first generation');
    validateBitrateRange(resolved);

    ensureActive(signal);
    if (this.taskID) {
      this.interaction.startInteraction(this.taskID, format);
      if (context) this.stream.updateGeneration(this.taskID, format, resolved);

      this.context = resolved;

      return null;
    }

    const taskID = taskIDFromUUID(
      this.rtc.randomUUID(),
      this.rtc.runtime.platform,
    );

    this.taskID = taskID;

    // The coordinator owns cleanup after this operation unwinds, including cancellation.
    // Keeping the task until then lets rendering hide before stop signals are sent.
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

/** Downlink limits are integers within [100, 10000] Kbps, minimum not above maximum. */
function validateBitrateRange(context: RealtimeContext): void {
  for (const value of [context.minimumBitrate, context.maximumBitrate])
    if (
      value != null &&
      (!Number.isSafeInteger(value) || value < 100 || value > 10000)
    )
      throw invalid(
        'Generation bitrate must be an integer within [100, 10000] Kbps',
      );

  if (
    context.minimumBitrate != null &&
    context.maximumBitrate != null &&
    context.minimumBitrate > context.maximumBitrate
  )
    throw invalid('Minimum generation bitrate must not exceed maximum bitrate');
}
