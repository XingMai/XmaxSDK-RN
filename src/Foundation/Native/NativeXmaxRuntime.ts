import { TurboModuleRegistry, type TurboModule } from 'react-native';

/**
 * The Codegen contract for permissions, native media ownership and runtime
 * metadata.
 */
export interface Spec extends TurboModule {
  requestPermissions(useMicrophone: boolean): Promise<string>;

  /** Reads orientation-corrected pixel dimensions without returning pixel data to JS. */
  imageInfo(fileURL: string): Promise<string>;

  /** Normalizes orientation and center-crops to a private JPEG file. */
  prepareImage(fileURL: string, width: number, height: number): Promise<string>;

  /** Removes only files created by prepareImage. */
  removePreparedImage(fileURL: string): Promise<void>;

  acquire(owner: string): boolean;

  isActive(owner: string): boolean;

  release(owner: string): void;

  randomUUID(): string;

  runtimeInfo(): string;
}

export default TurboModuleRegistry.getEnforcing<Spec>('XmaxRuntime');
