package ai.xmax.reactnative;

import com.ss.bytertc.engine.data.RemoteStreamKey;
import com.volcengine.VolcApiEngine.BeanFactory;
import com.volcengine.VolcApiEngine.runtime.Spec;
import com.volcengine.reactnative.vertc.events.IRTCVideoEventHandlerImpl;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

/** Normalizes stream keys before the owned RTC handler serializes them for JS. */
final class XmaxRtcEventAdapter implements BeanFactory.EventEmitter, AutoCloseable {
  private final BeanFactory.EventEmitter delegate;
  private final AtomicBoolean active = new AtomicBoolean(true);

  private XmaxRtcEventAdapter(BeanFactory.EventEmitter delegate) {
    this.delegate = delegate;
  }

  /** Installs on one handler only; the vendor's global factory remains unchanged. */
  static XmaxRtcEventAdapter install(IRTCVideoEventHandlerImpl handler) {
    if (handler.ee instanceof XmaxRtcEventAdapter) {
      XmaxRtcEventAdapter existing = (XmaxRtcEventAdapter) handler.ee;
      if (existing.active.get()) return existing;
      throw new IllegalStateException("RTC event handler has already been released");
    }
    XmaxRtcEventAdapter adapter = new XmaxRtcEventAdapter(handler.ee);
    handler.ee = adapter;
    return adapter;
  }

  @Override
  public void sendEvent(String name, Object... args) {
    if (!active.get()) return;

    Object[] forwarded = args;
    if (isStreamEvent(name) && args != null && args.length > 0
        && args[0] instanceof RemoteStreamKey) {
      RemoteStreamKey key = (RemoteStreamKey) args[0];
      if (key.streamIndex != null) {
        // A map is encoded field by field; a native object uses enum names.
        Map<String, Object> normalized = new HashMap<>();
        normalized.put("roomId", key.roomId);
        normalized.put("userId", key.userId);
        normalized.put("streamIndex", key.streamIndex.value());
        forwarded = args.clone();
        forwarded[0] = normalized;
      }
    }
    delegate.sendEvent(name, forwarded);
  }

  /** Leaves synchronous results and vendor variable ownership with the original emitter. */
  @Override
  public Object sendEventSyncWithResult(String name, Object... args) {
    return active.get() ? delegate.sendEventSyncWithResult(name, args) : null;
  }

  @Override
  public void addVar(Object value) {
    delegate.addVar(value);
  }

  @Override
  public void onResult(String name, Spec.Return result) {
    delegate.onResult(name, result);
  }

  /** Stops late events; the owned handler is released with its RTC engine. */
  @Override
  public void close() {
    active.set(false);
  }

  private static boolean isStreamEvent(String name) {
    return "onSEIMessageReceived".equals(name)
        || "onFirstRemoteVideoFrameDecoded".equals(name)
        || "onFirstRemoteVideoFrameRendered".equals(name);
  }
}
