import { RealtimeModel, XmaxEnvironment } from '@xmaxai/react-native-sdk';
import type { XLabLanguage } from '../localization/Localization';

/** Separate secure-storage slots; no shared API Key fallback between environments. */
export type ConfigurationField =
  | XmaxEnvironment
  | 'environment'
  | 'language'
  | 'model';

/** Minimal persistence boundary, implemented by the host's secure storage. */
export interface ConfigurationStorage {
  read(field: ConfigurationField): Promise<string | null>;

  write(field: ConfigurationField, value: string): Promise<void>;
}

/** Stable snapshot consumed by XLab; never included in logs or error messages. */
export interface SavedConfiguration {
  readonly keys: Readonly<Record<XmaxEnvironment, string>>;
  readonly environment: XmaxEnvironment;
  readonly language: XLabLanguage;
  readonly model: RealtimeModel;
  readonly loaded: boolean;
  readonly saving: boolean;
  /** Localized at render time so an existing failure follows language changes. */
  readonly error: 'configuration.readError' | 'configuration.saveError' | null;
}

/**
 * Owns environment-specific credentials and serializes persistence. Pending
 * edits to one slot coalesce without replacing edits to another environment.
 */
export class ConfigurationStore {
  private state: SavedConfiguration = {
    keys: { china: '', global: '' },
    environment: XmaxEnvironment.china,
    language: 'system',
    model: RealtimeModel.x2_0,
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
        const [china, global, environment, language, model] = await Promise.all(
          [
            this.storage.read(XmaxEnvironment.china),
            this.storage.read(XmaxEnvironment.global),
            this.storage.read('environment'),
            this.storage.read('language'),
            this.storage.read('model'),
          ],
        );

        this.publish({
          keys: { china: china ?? '', global: global ?? '' },
          model:
            model === RealtimeModel.x2_0_pro
              ? RealtimeModel.x2_0_pro
              : RealtimeModel.x2_0,
          language:
            language === 'zh-Hans' || language === 'en' ? language : 'system',
          environment:
            environment === XmaxEnvironment.global
              ? XmaxEnvironment.global
              : XmaxEnvironment.china,
          loaded: true,
        });
      } catch {
        this.publish({ error: 'configuration.readError' });
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

  /** Updates visible copy immediately and persists the choice independently of credentials. */
  selectLanguage(language: XLabLanguage): void {
    if (!this.state.loaded || language === this.state.language) return;

    this.publish({ language });
    this.enqueue('language', language);
  }

  /** Persists the model for future entries without modifying an active route. */
  selectModel(model: RealtimeModel): void {
    if (!this.state.loaded || model === this.state.model) return;

    this.publish({ model });
    this.enqueue('model', model);
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
        error: failed ? 'configuration.saveError' : null,
      });
    }
  }
}
