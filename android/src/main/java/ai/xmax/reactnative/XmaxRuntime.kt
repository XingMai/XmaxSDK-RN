package ai.xmax.reactnative
import android.app.Activity
import android.app.Application
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.common.LifecycleState
import com.ss.bytertc.engine.RTCVideo
import org.json.JSONObject
import java.util.UUID

@ReactModule(name = XmaxRuntime.NAME)
class XmaxRuntime(private val context: ReactApplicationContext) : NativeXmaxRuntimeSpec(context), Application.ActivityLifecycleCallbacks {
  companion object { const val NAME = "XmaxRuntime" }
  private val app = context.applicationContext as Application
  private val main = Handler(Looper.getMainLooper())
  @Volatile private var started = if (context.lifecycleState == LifecycleState.RESUMED) 1 else 0
  private var owner: String? = null
  private var active = false
  init { app.registerActivityLifecycleCallbacks(this) }
  override fun getName() = NAME
  @Synchronized override fun acquire(token: String): Boolean {
    if (owner != null || started == 0) return false
    owner = token; active = true; return true
  }
  @Synchronized override fun isActive(token: String): Boolean = owner == token && active
  @Synchronized override fun release(token: String) { if (owner == token) { active = false; owner = null } }
  override fun randomUUID() = UUID.randomUUID().toString()
  override fun runtimeInfo() = JSONObject().put("platform", "android").put("os_version", Build.VERSION.RELEASE).put("device_model", Build.MODEL).toString()
  override fun requestPermissions(useMicrophone: Boolean, promise: Promise) { promise.resolve("android-use-PermissionsAndroid") }
  @Synchronized private fun stopOwnedEngine() {
    if (owner != null && active) { active = false; RTCVideo.destroyRTCVideo() }
  }
  override fun invalidate() {
    app.unregisterActivityLifecycleCallbacks(this)
    main.removeCallbacksAndMessages(null)
    stopOwnedEngine()
    super.invalidate()
  }
  override fun onActivityStarted(activity: Activity) { started += 1 }
  override fun onActivityStopped(activity: Activity) {
    started = (started - 1).coerceAtLeast(0)
    if (!activity.isChangingConfigurations) main.postDelayed({ if (started == 0) stopOwnedEngine() }, 250)
  }
  override fun onActivityCreated(activity: Activity, state: Bundle?) {}
  override fun onActivityResumed(activity: Activity) {}
  override fun onActivityPaused(activity: Activity) {}
  override fun onActivitySaveInstanceState(activity: Activity, state: Bundle) {}
  override fun onActivityDestroyed(activity: Activity) {}
}
