import {
  DefaultTrajectoryEffectRenderer,
  type TrajectoryID,
} from '@xmax/react-native-sdk';

/** Same touch effects as the SDK, with alternating pink/blue fingers like iOS XLab. */
export class XLabTrajectoryRenderer extends DefaultTrajectoryEffectRenderer {
  private nextColor = 0;

  protected override colorsForTrajectory(_id: TrajectoryID) {
    return this.nextColor++ % 2 === 0
      ? { core: '#FFE6FA', glow: '#FF2EB8' }
      : { core: '#E6FAFF', glow: '#24BDFF' };
  }

  override reset(): void {
    this.nextColor = 0;
    super.reset();
  }
}
