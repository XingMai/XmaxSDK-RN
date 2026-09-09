import { TurboModuleRegistry, type TurboModule } from 'react-native';
export interface Spec extends TurboModule {
  requestPermissions(useMicrophone: boolean): Promise<string>;
  acquire(owner: string): boolean;
  isActive(owner: string): boolean;
  release(owner: string): void;
  randomUUID(): string;
  runtimeInfo(): string;
}
export default TurboModuleRegistry.getEnforcing<Spec>('XmaxRuntime');
