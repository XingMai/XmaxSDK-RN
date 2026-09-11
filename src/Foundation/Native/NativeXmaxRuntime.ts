import { TurboModuleRegistry, type TurboModule } from 'react-native';

/**
 * The Codegen contract for permissions, native media ownership and runtime
 * metadata.
 */
export interface Spec extends TurboModule {
  /** Updates the global filter shared by JS and native SDK diagnostics. */
  configureLogging(options: number): void;

  /** Writes a preformatted SDK message to OSLog or Logcat without triggering LogBox. */
  writeLog(level: string, message: string, option: number): void;

  /** Hides the matching SDK container on the native UI thread before RTC teardown. */
  hideVideoContainer(reactTag: number, nativeID: string): Promise<void>;

  requestPermissions(useMicrophone: boolean): Promise<string>;

  /** Reads orientation-corrected pixel dimensions without returning pixel data to JS. */
  imageInfo(fileURL: string): Promise<string>;

  /** Normalizes orientation and center-crops to a private JPEG file. */
  prepareImage(fileURL: string, width: number, height: number): Promise<string>;

  /** Removes only files created by prepareImage. */
  removePreparedImage(fileURL: string): Promise<void>;

  /** Repeats a prepared image in native memory, without JS frame delivery. */
  startImageVideo(
    owner: string,
    path: string,
    width: number,
    height: number,
    fps: number,
  ): Promise<void>;

  /** Stops native frame delivery before destroying the owner's RTC engine. */
  stopImageVideo(owner: string): void;

  /** Reads platform UI state asynchronously before acquiring a media lease. */
  prepareRuntime(): Promise<void>;

  acquire(owner: string): boolean;

  isActive(owner: string): boolean;

  release(owner: string): void;

  randomUUID(): string;

  runtimeInfo(): string;
}

export default TurboModuleRegistry.getEnforcing<Spec>('XmaxRuntime');
