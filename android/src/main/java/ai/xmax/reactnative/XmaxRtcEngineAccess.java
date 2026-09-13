package ai.xmax.reactnative;

import com.ss.bytertc.engine.RTCVideo;
import com.ss.bytertc.engine.handler.IRTCVideoEventHandler;

/** Accesses the pinned RTC SDK singleton already created by the RN adapter. */
abstract class XmaxRtcEngineAccess extends RTCVideo {
  static RTCVideo current() {
    return mInstance;
  }

  /** Reads the current handler without reflection or replacing the engine. */
  static IRTCVideoEventHandler currentHandler() {
    return mInstance == null ? null : mInstance.getRtcEngineHandler();
  }
}
