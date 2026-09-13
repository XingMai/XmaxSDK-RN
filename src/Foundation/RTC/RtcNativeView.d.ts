/**
 * RTC 1.3.2 bundles NativeView at runtime but imports its type from an unpublished
 * package. This declaration supplies that base type and ships with the SDK.
 */
declare module '@vcloud-lux/hybrid-runtime' {
  export class NativeView {
    readonly viewId: string;

    constructor(viewId: string);

    static getView<T extends NativeView>(
      viewId: string,
      ctor: new (viewId: string) => T,
    ): T;
  }
}
