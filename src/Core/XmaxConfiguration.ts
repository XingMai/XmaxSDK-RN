export enum XmaxEnvironment {
  china = 'china',
  global = 'global',
}
export enum XmaxLoggerOption {
  business = 1,
  performance = 2,
  all = 3,
}
export interface XmaxConfiguration {
  readonly apiKey: string;
  readonly environment?: XmaxEnvironment;
  readonly loggerOptions?: number;
}
export const apiBaseURLs = {
  [XmaxEnvironment.china]: 'https://cloud.xmax.22duck.cn/open/api/v1',
  [XmaxEnvironment.global]: 'https://api.xmax.cloud/open/api/v1',
};
