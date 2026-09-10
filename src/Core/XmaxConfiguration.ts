/**
 * The regional environment used for Xmax API requests.
 */
export enum XmaxEnvironment {
  china = 'china',
  global = 'global',
}

/**
 * Logging categories that can be combined with the bitwise OR operator.
 */
export enum XmaxLoggerOption {
  business = 1,
  performance = 2,
  all = 3,
}

/**
 * Configuration shared by services created from an XmaxClient.
 */
export interface XmaxConfiguration {
  /**
   * The Xmax API key. Required for server operations; local preview allows an
   * empty key.
   */
  readonly apiKey: string;

  /**
   * The API environment. Defaults to XmaxEnvironment.china.
   */
  readonly environment?: XmaxEnvironment;

  /**
   * A bitmask of XmaxLoggerOption values. Defaults to 0 (logging disabled).
   */
  readonly loggerOptions?: number;
}

export const apiBaseURLs = {
  [XmaxEnvironment.china]: 'https://cloud.xmax.22duck.cn/open/api/v1',
  [XmaxEnvironment.global]: 'https://api.xmax.cloud/open/api/v1',
};
