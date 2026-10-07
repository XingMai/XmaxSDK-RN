import { RealtimeModel, XmaxEnvironment } from '@xmaxai/react-native-sdk';
import type { XLabLanguage } from '../localization/Localization';

/** The API backends XLab can target; credentials persist independently per endpoint. */
export type XLabApiEndpoint = 'china' | 'global';

/** Models offered by XLab; persisted selections outside this list fall back to the default. */
export const xlabModels: readonly RealtimeModel[] = [
  RealtimeModel.x2_0,
  RealtimeModel.x2_1_preview,
];

/** Maps an endpoint to the SDK environment used when creating clients. */
export function environmentForEndpoint(
  endpoint: XLabApiEndpoint,
): XmaxEnvironment {
  return endpoint === XmaxEnvironment.global
    ? XmaxEnvironment.global
    : XmaxEnvironment.china;
}

/** Resolves the explicit API base URL for an endpoint, bypassing SDK environment routing. */
export function apiBaseURLForEndpoint(endpoint: XLabApiEndpoint): string {
  return endpoint === 'global'
    ? 'https://api.xmax.ai/open/api/v1'
    : 'https://api.xmaxai.com/open/api/v1';
}

/** Separate secure-storage slots; no shared API Key fallback between endpoints. */
export type ConfigurationField =
  | XLabApiEndpoint
  | 'environment'
  | 'language'
  | 'model'
  | 'minBitrate'
  | 'maxBitrate'
  | 'downMinBitrate'
  | 'downMaxBitrate';

/** Persisted raw bitrate fields, uplink and downlink (server push) pairs. */
export type BitrateField =
  | 'minBitrate'
  | 'maxBitrate'
  | 'downMinBitrate'
  | 'downMaxBitrate';

/** Minimal persistence boundary, implemented by the host's secure storage. */
export interface ConfigurationStorage {
  read(field: ConfigurationField): Promise<string | null>;

  write(field: ConfigurationField, value: string): Promise<void>;
}

/** Stable snapshot consumed by XLab; never included in logs or error messages. */
export interface SavedConfiguration {
  readonly keys: Readonly<Record<XLabApiEndpoint, string>>;
  readonly endpoint: XLabApiEndpoint;
  readonly language: XLabLanguage;
  readonly model: RealtimeModel;
  /** Raw kbps input preserved as typed; empty keeps SDK bitrate defaults. */
  readonly minBitrate: string;
  readonly maxBitrate: string;
  /** Raw downlink (server push) kbps input; empty keeps server defaults. */
  readonly downMinBitrate: string;
  readonly downMaxBitrate: string;
  readonly loaded: boolean;
  readonly saving: boolean;
  /** Localized at render time so an existing failure follows language changes. */
  readonly error: 'configuration.readError' | 'configuration.saveError' | null;
}

/**
 * Owns endpoint-specific credentials and serializes persistence. Pending
 * edits to one slot coalesce without replacing edits to another endpoint.
 */
export class ConfigurationStore {
  private state: SavedConfiguration = {
    keys: { china: '', global: '' },
    endpoint: 'china',
    language: 'system',
    model: RealtimeModel.x2_1_preview,
    minBitrate: '',
    maxBitrate: '',
    downMinBitrate: '',
    downMaxBitrate: '',
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
        const [
          china,
          global,
          endpoint,
          language,
          model,
          minBitrate,
          maxBitrate,
          downMinBitrate,
          downMaxBitrate,
        ] = await Promise.all([
          this.storage.read('china'),
          this.storage.read('global'),
          this.storage.read('environment'),
          this.storage.read('language'),
          this.storage.read('model'),
          this.storage.read('minBitrate'),
          this.storage.read('maxBitrate'),
          this.storage.read('downMinBitrate'),
          this.storage.read('downMaxBitrate'),
        ]);

        this.publish({
          keys: { china: china ?? '', global: global ?? '' },
          endpoint: endpoint === 'global' ? 'global' : 'china',
          model:
            xlabModels.find(supported => supported === model) ??
            RealtimeModel.x2_1_preview,
          minBitrate: minBitrate ?? '',
          maxBitrate: maxBitrate ?? '',
          downMinBitrate: downMinBitrate ?? '',
          downMaxBitrate: downMaxBitrate ?? '',
          language:
            language === 'zh-Hans' || language === 'en' ? language : 'system',
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

  setKey(endpoint: XLabApiEndpoint, value: string): void {
    if (!this.state.loaded) return;

    this.publish({ keys: { ...this.state.keys, [endpoint]: value } });
    this.enqueue(endpoint, value.trim());
  }

  /** Persists the endpoint for future entries without modifying an active route. */
  selectEndpoint(endpoint: XLabApiEndpoint): void {
    if (!this.state.loaded || endpoint === this.state.endpoint) return;

    this.publish({ endpoint });
    this.enqueue('environment', endpoint);
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
    if (!xlabModels.includes(model)) return;

    this.publish({ model });
    this.enqueue('model', model);
  }

  /** Publishes kbps input as typed and persists the trimmed value. */
  setBitrate(field: BitrateField, value: string): void {
    if (!this.state.loaded) return;

    this.publish({ [field]: value });
    this.enqueue(field, value.trim());
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

/** Parsed upload bitrate limits in kbps, applied when creating local streams. */
export interface BitrateOverride {
  readonly minimum: number;
  readonly maximum: number;
}

/**
 * Parses raw kbps inputs for a new stream. Both empty keeps SDK defaults;
 * otherwise both must be safe integers with a positive maximum not below the
 * minimum. 'invalid' input stays on the feed until the user fixes it.
 */
export function parseBitrateOverride(
  minBitrate: string,
  maxBitrate: string,
): BitrateOverride | null | 'invalid' {
  const minimum = minBitrate.trim(),
    maximum = maxBitrate.trim();

  if (!minimum && !maximum) return null;
  if (!/^\d+$/.test(minimum) || !/^\d+$/.test(maximum)) return 'invalid';

  const lo = Number(minimum),
    hi = Number(maximum);

  if (!Number.isSafeInteger(lo) || !Number.isSafeInteger(hi)) return 'invalid';
  if (hi <= 0 || lo > hi) return 'invalid';

  return { minimum: lo, maximum: hi };
}

/**
 * Parses downlink (server push) kbps inputs for a new generation task. Both
 * empty keeps server defaults; otherwise both must be integers within the
 * server's [100, 10000] Kbps range with minimum not above maximum.
 */
export function parseGenerationBitrate(
  minBitrate: string,
  maxBitrate: string,
): BitrateOverride | null | 'invalid' {
  const parsed = parseBitrateOverride(minBitrate, maxBitrate);

  if (parsed === null || parsed === 'invalid') return parsed;
  if (parsed.minimum < 100 || parsed.maximum > 10000) return 'invalid';

  return parsed;
}
