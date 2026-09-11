import type {
  LocalStreamStats,
  RemoteStreamStats,
  NetworkQualityStats,
  SysStats,
} from '@volcengine/react-native-rtc';
import { XmaxLoggerOption } from '../../Core/XmaxConfiguration';
import type { RealtimePerformanceAlarm } from '../../Service/Realtime/RealtimeTypes';
import { XmaxLogger } from '../Logging/XmaxLogger';

const number = (value: number | undefined, unit = '') =>
  typeof value === 'number' && Number.isFinite(value)
    ? `${value}${unit}`
    : 'unavailable';
const percent = (value: number) =>
  number(
    Number.isFinite(value) ? Math.round(value * 10000) / 100 : undefined,
    '%',
  );

const qualities = [
  '未知 (Unknown)',
  '极好 (Excellent)',
  '良好 (Good)',
  '较差 (Poor)',
  '差 (Bad)',
  '极差 (Very Bad)',
  '断网 (Disconnected)',
];

/** Formats only selected vendor metrics; native-backed getters are read only while logging is enabled. */
export class RtcStatsLogger {
  /** Records camera/encoder/send cadence, resolution and uplink quality. */
  static local(stats: LocalStreamStats): void {
    XmaxLogger.rtc.debug(() => {
      const video = stats.videoStats;
      return (
        `本地视频发送 (Local Video Uplink)\n` +
        `├─ 分辨率 (Resolution)：${number(video.encodedFrameWidth)} × ${number(
          video.encodedFrameHeight,
        )}\n` +
        `├─ 发送码率 (Send Bitrate)：${number(video.sentKBitrate, ' kbps')}\n` +
        `├─ 采集帧率 (Capture Frame Rate)：${number(
          video.inputFrameRate,
          ' fps',
        )}\n` +
        `├─ 编码帧率 (Encode Frame Rate)：${number(
          video.encoderOutputFrameRate,
          ' fps',
        )}\n` +
        `├─ 发送帧率 (Send Frame Rate)：${number(
          video.sentFrameRate,
          ' fps',
        )}\n` +
        `├─ 视频丢包率 (Video Packet Loss)：${percent(video.videoLossRate)}\n` +
        `├─ 网络往返时延 (Round-Trip Time)：${number(video.rtt, ' ms')}\n` +
        `└─ 网络抖动 (Network Jitter)：${number(video.jitter, ' ms')}`
      );
    }, XmaxLoggerOption.performance);
  }

  /** Selects the platform-specific render frame-rate getter instead of reading unsupported fields. */
  static remote(stats: RemoteStreamStats, platform: string): void {
    XmaxLogger.rtc.debug(() => {
      const video = stats.videoStats;
      const rendered =
        platform === 'ios'
          ? video.ios_renderOutputFrameRate
          : video.android_rendererOutputFrameRate;
      return (
        `远端视频接收 (Remote Video Downlink)\n` +
        `├─ 分辨率 (Resolution)：${number(video.width)} × ${number(
          video.height,
        )}\n` +
        `├─ 接收码率 (Receive Bitrate)：${number(
          video.receivedKBitrate,
          ' kbps',
        )}\n` +
        `├─ 解码帧率 (Decode Frame Rate)：${number(
          video.decoderOutputFrameRate,
          ' fps',
        )}\n` +
        `├─ 渲染帧率 (Render Frame Rate)：${number(rendered, ' fps')}\n` +
        `├─ 视频丢包率 (Video Packet Loss)：${percent(video.videoLossRate)}\n` +
        `├─ 网络往返时延 (Round-Trip Time)：${number(video.rtt, ' ms')}\n` +
        `├─ 卡顿次数 (Stall Count)：${number(video.stallCount)}\n` +
        `├─ 卡顿时长 (Stall Duration)：${number(
          video.stallDuration,
          ' ms',
        )}\n` +
        `└─ 端到端时延 (End-to-End Delay)：${number(video.e2eDelay, ' ms')}`
      );
    }, XmaxLoggerOption.performance);
  }

  /** Reports uplink/downlink without including remote user identifiers. */
  static network(
    local: NetworkQualityStats,
    remotes: NetworkQualityStats[],
    platform: string,
  ): void {
    XmaxLogger.rtc.debug(() => {
      const metrics = (
        stats: NetworkQualityStats,
        direction: 'txQuality' | 'rxQuality',
      ) => {
        const loss =
          platform === 'ios' ? stats.ios_lossRatio : stats.android_fractionLost;
        return (
          `Quality=${
            qualities[stats[direction]] ?? qualities[0]
          }, Packet Loss=${percent(loss)}, ` +
          `RTT=${number(stats.rtt, ' ms')}, Bandwidth=${number(
            stats.totalBandwidth / 1000,
            ' kbps',
          )}`
        );
      };
      return (
        `网络质量 (Network Quality Metrics)\n本地发送 (Local Uplink)：${metrics(
          local,
          'txQuality',
        )}` +
        remotes
          .map(
            (stats, index) =>
              `\n远端接收 (Remote Downlink ${index + 1})：${metrics(
                stats,
                'rxQuality',
              )}`,
          )
          .join('')
      );
    }, XmaxLoggerOption.performance);
  }

  /** iOS total CPU is not exposed by the pinned RN wrapper and is explicitly marked unavailable. */
  static system(stats: SysStats, platform: string): void {
    XmaxLogger.rtc.debug(
      () =>
        `性能统计 (System Performance Metrics)\n` +
        `├─ CPU：App ${percent(stats.cpuAppUsage)}, System ${
          platform === 'android'
            ? percent(stats.android_cpuTotalUsage)
            : 'unavailable'
        }, Cores ${number(stats.cpuCores)}\n` +
        `└─ 内存 (Memory)：App ${number(
          stats.memoryUsage,
          ' MB',
        )}, App Usage ${number(stats.memoryRatio, '%')}, System Usage ${number(
          stats.totalMemoryRatio,
          '%',
        )}`,
      XmaxLoggerOption.performance,
    );
  }

  /** Uses the existing normalized alarm without changing listener or downgrade behavior. */
  static alarm(alarm: RealtimePerformanceAlarm): void {
    XmaxLogger.rtc.warn(() => {
      const format = alarm.suggestedVideoFormat;
      return (
        `性能告警 (Performance Alert)\n状态 (Status)：${alarm.status}` +
        (format
          ? `\n建议 (Recommendation)：${format.width} × ${format.height}, ${format.fps} fps`
          : '')
      );
    }, XmaxLoggerOption.performance);
  }
}
