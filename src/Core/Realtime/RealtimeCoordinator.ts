import {
  cancelledError,
  invalid,
  XmaxError,
  XmaxErrorCode,
} from '../../Foundation/Errors/XmaxError';
import { XmaxLogger } from '../../Foundation/Logging/XmaxLogger';
import {
  RealtimeConnectionState,
  type RealtimeReason,
  type RealtimeState,
} from '../../Service/Realtime/RealtimeTypes';
import type { RealtimeStateListener } from './XmaxRealtimeManaging';

/** Cleanup distinguishes a connection from the complete local media lifecycle. */
export type TerminationScope = 'connection' | 'all';
type OperationKind =
  | 'media'
  | 'connection'
  | 'generation'
  | 'cameraSwitch'
  | 'configuration';

/** An operation may commit state only while its lease is current. */
export interface RealtimeOperation {
  readonly signal: AbortSignal;
  ensureCurrent(): void;
  setFailureScope(scope: TerminationScope): void;
}

interface Operation {
  kind: OperationKind;
  controller: AbortController;
  completion: Promise<unknown>;
  failureScope: TerminationScope | null;
}

interface Termination {
  scope: TerminationScope;
  reason: RealtimeReason;
  sessionID: string | null;
  operation: Operation | null;
  cleanups: Promise<void>[];
  completion: Promise<void>;
}

/** Owns state commits, operation admission and coalesced lifecycle termination. */
export class RealtimeCoordinator {
  private state: RealtimeState = Object.freeze({
    connectionState: RealtimeConnectionState.idle,
    sessionID: null,
    taskID: null,
    reason: null,
  });
  private listener: RealtimeStateListener | null = null;
  private operation: Operation | null = null;
  private termination: Termination | null = null;

  constructor(
    private readonly cleanup: (scope: TerminationScope) => Promise<void>,
    private readonly hasLocalMedia: () => boolean,
    private readonly lastSessionID: () => string | null = () => null,
  ) {}

  get currentState(): RealtimeState {
    return this.state;
  }

  setStateListener(listener: RealtimeStateListener | null): void {
    this.listener = listener;
    this.notify(listener);
  }

  /** Camera capture already has a valid frame when its local track is created. */
  localPreviewDidBecomeReady(): void {
    if (
      !this.termination &&
      this.state.connectionState === RealtimeConnectionState.preparing
    )
      this.setState({
        ...this.state,
        connectionState: RealtimeConnectionState.ready,
      });
  }

  /** Rejects overlapping work; configuration failures preserve the running generation. */
  run<T>(
    kind: OperationKind,
    action: (token: RealtimeOperation) => Promise<T>,
  ): Promise<T> {
    if (this.operation || this.termination)
      return Promise.reject(
        invalid('Another realtime operation is in progress'),
      );

    const entry: Operation = {
      kind:
        kind === 'generation' &&
        this.state.connectionState === RealtimeConnectionState.generating
          ? 'configuration'
          : kind,
      controller: new AbortController(),
      completion: Promise.resolve(),
      failureScope: null,
    };
    const token: RealtimeOperation = {
      signal: entry.controller.signal,
      ensureCurrent: () => {
        if (entry.controller.signal.aborted || this.operation !== entry) {
          const reason: unknown = entry.controller.signal.reason;
          throw reason instanceof XmaxError ? reason : cancelledError();
        }
      },
      setFailureScope: scope => {
        entry.failureScope = scope;
      },
    };
    this.operation = entry;
    const body = Promise.resolve().then(() => {
      token.ensureCurrent();
      return action(token);
    });
    // Termination waits for the body, never the caller's promise that waits for termination.
    entry.completion = body.then(
      () => {},
      () => {},
    );
    return body
      .then(value => {
        token.ensureCurrent();
        if (this.operation === entry) this.operation = null;
        return value;
      })
      .catch(async error => {
        const aborted = entry.controller.signal.aborted;
        const failure = aborted
          ? entry.controller.signal.reason instanceof XmaxError
            ? entry.controller.signal.reason
            : cancelledError()
          : XmaxError.from(error);
        if (this.termination?.operation === entry) {
          await this.termination.completion;
        } else if (
          this.operation === entry &&
          entry.kind !== 'configuration' &&
          entry.failureScope
        ) {
          await this.terminate(
            entry.failureScope,
            failure.code === XmaxErrorCode.cancelled
              ? { type: 'normal' }
              : { type: 'failure', error: failure },
          );
        } else {
          if (this.operation === entry) this.operation = null;
          if (
            !aborted &&
            entry.kind === 'media' &&
            this.state.connectionState === RealtimeConnectionState.preparing
          )
            this.setState({
              connectionState: RealtimeConnectionState.idle,
              sessionID: null,
              taskID: null,
              reason: null,
            });
        }
        if (failure.code !== XmaxErrorCode.cancelled)
          XmaxLogger.realtime.error(
            () => `Realtime operation failed: ${failure.code}`,
          );
        throw failure;
      });
  }

  /** Commits a snapshot only on behalf of the current operation. */
  commit(state: RealtimeState, token: RealtimeOperation): void {
    token.ensureCurrent();
    this.setState(state);
  }

  /** Disconnect leaves an unrelated local preparation operation running. */
  disconnect(reason: RealtimeReason = { type: 'normal' }): Promise<void> {
    if (
      !this.termination &&
      (!this.operation || this.operation.kind === 'media') &&
      [
        RealtimeConnectionState.idle,
        RealtimeConnectionState.preparing,
        RealtimeConnectionState.ready,
      ].includes(this.state.connectionState)
    )
      return Promise.resolve();
    return this.terminate('connection', reason);
  }

  /** Starts cleanup promptly, joins repeated requests and allows close to expand its scope. */
  terminate(
    scope: TerminationScope,
    reason: RealtimeReason = { type: 'normal' },
  ): Promise<void> {
    const existing = this.termination;
    if (existing) {
      if (scope === 'all' && existing.scope !== 'all') {
        existing.scope = 'all';
        if (existing.operation && !existing.operation.controller.signal.aborted)
          existing.operation.controller.abort(
            reason.type === 'failure' ? reason.error : undefined,
          );
        existing.cleanups.push(this.startCleanup('all', existing));
        if (reason.type === 'failure') existing.reason = reason;
      }
      return existing.completion;
    }

    const pending: Termination = {
      scope,
      reason,
      sessionID: this.state.sessionID,
      operation: this.operation,
      cleanups: [],
      completion: Promise.resolve(),
    };
    this.termination = pending;
    if (
      pending.operation &&
      (scope === 'all' || pending.operation.kind !== 'media')
    )
      pending.operation.controller.abort(
        reason.type === 'failure' ? reason.error : undefined,
      );
    pending.cleanups.push(this.startCleanup(scope, pending));
    pending.completion = Promise.resolve().then(async () => {
      await pending.operation?.completion;
      let completed = 0;
      while (completed < pending.cleanups.length) {
        const work = pending.cleanups.slice(completed);
        completed += work.length;
        await Promise.all(work);
      }
      const next: RealtimeState = {
        connectionState:
          pending.scope === 'all' || !this.hasLocalMedia()
            ? RealtimeConnectionState.idle
            : RealtimeConnectionState.ready,
        sessionID: this.lastSessionID() ?? pending.sessionID,
        taskID: null,
        reason: pending.reason,
      };
      // Release admission before notifying: a listener can immediately create/connect again.
      if (this.operation === pending.operation) this.operation = null;
      this.termination = null;
      this.setState(next);
    });
    this.setState({
      ...this.state,
      connectionState: RealtimeConnectionState.disconnecting,
      taskID: null,
      reason: null,
    });
    return pending.completion;
  }

  private startCleanup(
    scope: TerminationScope,
    pending: Termination,
  ): Promise<void> {
    return Promise.resolve()
      .then(() => this.cleanup(scope))
      .catch(error => {
        const failure = XmaxError.from(error);
        XmaxLogger.realtime.error(
          () => `Realtime cleanup failed: ${failure.code}`,
        );
        if (pending.reason.type !== 'failure')
          pending.reason = { type: 'failure', error: failure };
      });
  }

  private setState(state: RealtimeState): void {
    const previous = this.state;
    if (
      previous.connectionState === state.connectionState &&
      previous.sessionID === state.sessionID &&
      previous.taskID === state.taskID &&
      previous.reason === state.reason
    )
      return;
    this.state = Object.freeze({
      ...state,
      reason: state.reason ? Object.freeze({ ...state.reason }) : null,
    });
    XmaxLogger.realtime.info(
      () => `Connection State: ${state.connectionState}`,
    );
    this.notify(this.listener);
  }

  private notify(listener: RealtimeStateListener | null): void {
    try {
      listener?.(this.state);
    } catch {
      XmaxLogger.realtime.warn('Host listener threw an exception');
    }
  }
}
