package ai.xmax.reactnative;

import static org.junit.Assert.*;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONObject;
import com.ss.bytertc.engine.data.RemoteStreamKey;
import com.ss.bytertc.engine.data.StreamIndex;
import com.ss.bytertc.engine.data.VideoFrameInfo;
import com.volcengine.VolcApiEngine.BeanFactory;
import com.volcengine.VolcApiEngine.runtime.JsonHelper;
import com.volcengine.VolcApiEngine.runtime.ProtoImpl;
import com.volcengine.VolcApiEngine.runtime.Spec;
import com.volcengine.reactnative.vertc.events.ClassHelper;
import com.volcengine.reactnative.vertc.events.IRTCVideoEventHandlerImpl;
import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.List;
import org.junit.Test;

public class XmaxRtcEventAdapterTest {
  private static final class Emitter implements BeanFactory.EventEmitter {
    final List<Object[]> events = new ArrayList<>();
    Object variable;
    Spec.Return result;

    public void sendEvent(String name, Object... args) {
      events.add(args);
    }

    public Object sendEventSyncWithResult(String name, Object... args) {
      return args[0];
    }

    public void addVar(Object value) {
      variable = value;
    }

    public void onResult(String name, Spec.Return value) {
      result = value;
    }
  }

  @Test
  public void officialSerializationProducesNumericKeysForAllThreeAdaptedEvents() {
    ClassHelper.init();
    ProtoImpl proto = new ProtoImpl();
    Emitter receiver = new Emitter();
    IRTCVideoEventHandlerImpl handler = new IRTCVideoEventHandlerImpl(receiver);
    XmaxRtcEventAdapter.install(handler);
    ByteBuffer message = ByteBuffer.wrap(new byte[] {49, 50});
    VideoFrameInfo frame = new VideoFrameInfo(1024, 1920, 0);

    for (StreamIndex stream : StreamIndex.values()) {
      RemoteStreamKey key = new RemoteStreamKey("room", "bot", stream);
      // Establish the behavior of the unmodified native dependency as a control.
      JSONObject original = JSON.parseArray(JsonHelper.getJsonString(proto.encodeArgs(new Object[] {key}))).getJSONObject(0);
      assertEquals(stream.name(), original.get("streamIndex"));

      receiver.events.clear();
      handler.onSEIMessageReceived(key, message);
      handler.onFirstRemoteVideoFrameDecoded(key, frame);
      handler.onFirstRemoteVideoFrameRendered(key, frame);
      assertEquals(3, receiver.events.size());
      for (Object[] args : receiver.events) {
        // Exercise the real key serializer. Payload identity is checked below;
        // Android's Base64 implementation is not available in a JVM unit test.
        JSONObject encoded = JSON.parseArray(JsonHelper.getJsonString(proto.encodeArgs(new Object[] {args[0]}))).getJSONObject(0);
        assertEquals(stream.value(), encoded.get("streamIndex"));
        assertEquals("room", encoded.getString("roomId"));
        assertEquals("bot", encoded.getString("userId"));
      }
      assertSame(message, receiver.events.get(0)[1]);
      assertSame(frame, receiver.events.get(1)[1]);
      assertSame(frame, receiver.events.get(2)[1]);
      assertSame(stream, key.streamIndex);
    }
  }

  @Test
  public void forwardsUnrelatedEventsAndDoesNotModifyOtherHandlers() {
    Emitter receiver = new Emitter();
    IRTCVideoEventHandlerImpl owned = new IRTCVideoEventHandlerImpl(receiver);
    IRTCVideoEventHandlerImpl other = new IRTCVideoEventHandlerImpl(receiver);
    XmaxRtcEventAdapter adapter = XmaxRtcEventAdapter.install(owned);
    assertSame(adapter, XmaxRtcEventAdapter.install(owned));
    assertSame(receiver, other.ee);

    Object value = new Object();
    Object[] args = new Object[] {value};
    adapter.sendEvent("unrelated", args);
    assertSame(args, receiver.events.get(0));
    assertSame(value, adapter.sendEventSyncWithResult("synchronous", value));
    adapter.addVar(value);
    assertSame(value, receiver.variable);
    adapter.onResult("result", null);
    assertNull(receiver.result);
    owned.onError(42);
    assertEquals(42, receiver.events.get(1)[0]);

    adapter.close();
    adapter.close();
    owned.onError(43);
    owned.onSEIMessageReceived(new RemoteStreamKey("room", "bot", StreamIndex.STREAM_INDEX_MAIN), ByteBuffer.allocate(0));
    assertEquals(2, receiver.events.size());
    assertNull(adapter.sendEventSyncWithResult("synchronous", value));
    other.onError(44);
    assertEquals(44, receiver.events.get(2)[0]);
  }

  @Test
  public void preservesMalformedKeysForVendorValidation() {
    Emitter receiver = new Emitter();
    IRTCVideoEventHandlerImpl handler = new IRTCVideoEventHandlerImpl(receiver);
    XmaxRtcEventAdapter.install(handler);
    RemoteStreamKey key = new RemoteStreamKey("room", "bot", null);
    handler.onSEIMessageReceived(key, ByteBuffer.allocate(0));
    assertSame(key, receiver.events.get(0)[0]);
  }
}
