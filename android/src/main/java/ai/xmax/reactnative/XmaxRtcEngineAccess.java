package ai.xmax.reactnative;

import com.ss.bytertc.engine.RTCVideo;

/** Accesses the pinned RTC SDK singleton already created by the RN adapter. */
abstract class XmaxRtcEngineAccess extends RTCVideo {
  static RTCVideo current() {
    return mInstance;
  }
}
