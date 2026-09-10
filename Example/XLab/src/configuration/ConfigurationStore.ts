import { XmaxEnvironment } from '@xmax/react-native-sdk';

/** Separate secure-storage slots; no shared API Key fallback between environments. */
export type ConfigurationField = XmaxEnvironment | 'environment';

/** Minimal persistence boundary, implemented by the host's secure storage. */
export interface ConfigurationStorage {
  read(field: ConfigurationField): Promise<string | null>;

  write(field: ConfigurationField, value: string): Promise<void>;
}

/** Stable snapshot consumed by XLab; never included in logs or error messages. */
export interface SavedConfiguration {
  readonly keys: Readonly<Record<XmaxEnvironment, string>>;
  readonly environment: XmaxEnvironment;
  readonly loaded: boolean;
  readonly saving: boolean;
  readonly error: string | null;
}

/**
 * Owns environment-specific credentials and serializes persistence. Pending
 * edits to one slot coalesce without replacing edits to another environment.
 */
export class ConfigurationStore {
  private state: SavedConfiguration = {
    keys: { china: '', global: '' },
    environment: XmaxEnvironment.china,
    loaded: false,
    saving: false,
    error: null,
  };
  private readonly listeners = new Set<() => void>();
  private readonly pending = new Map<ConfigurationField, string>();
  private loading: Promise<void> | null = null;
  private writing = false;

  constructor(private readonly storage: ConfigurationStorage) {}

  getSnapshot = (): SavedConfiguration => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  private publish(update: Partial<SavedConfiguration>): void {
    this.state = { ...this.state, ...update };
    for (const listener of this.listeners) listener();
  }

  /** Completes hydration before accepting edits so stale reads cannot overwrite input. */
  load(): Promise<void> {
    if (this.state.loaded) return Promise.resolve();
    if (this.loading) return this.loading;

    this.publish({ error: null });
    this.loading = (async () => {
      try {
        const [china, global, environment] = await Promise.all([
          this.storage.read(XmaxEnvironment.china),
          this.storage.read(XmaxEnvironment.global),
          this.storage.read('environment'),
        ]);

        this.publish({
          keys: { china: china ?? '', global: global ?? '' },
          environment:
            environment === XmaxEnvironment.global
              ? XmaxEnvironment.global
              : XmaxEnvironment.china,
          loaded: true,
        });
      } catch {
        this.publish({ error: '无法读取已保存的配置，请重试。' });
      } finally {
        this.loading = null;
      }
    })();

    return this.loading;
  }

  setKey(environment: XmaxEnvironment, value: string): void {
    if (!this.state.loaded) return;

    this.publish({ keys: { ...this.state.keys, [environment]: value } });
    this.enqueue(environment, value.trim());
  }

  selectEnvironment(environment: XmaxEnvironment): void {
    if (!this.state.loaded) return;

    this.publish({ environment });
    this.enqueue('environment', environment);
  }

  private enqueue(field: ConfigurationField, value: string): void {
    this.pending.set(field, value);
    void this.flush();
  }

  /** Retries unsaved values; a failed write never discards newer edits. */
  async flush(): Promise<void> {
    if (this.writing || !this.pending.size) return;

    this.writing = true;
    this.publish({ saving: true, error: null });
    let failed = false;

    try {
      while (this.pending.size) {
        const [field, value] = this.pending.entries().next().value!;

        this.pending.delete(field);
        try {
          await this.storage.write(field, value);
        } catch {
          if (!this.pending.has(field)) this.pending.set(field, value);
          failed = true;
          break;
        }
      }
    } finally {
      this.writing = false;
      this.publish({
        saving: false,
        error: failed ? '配置保存失败，请重试。' : null,
      });
    }
  }
}
