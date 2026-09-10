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
import java.io.File

@ReactModule(name = XmaxRuntime.NAME)
class XmaxRuntime(private val context: ReactApplicationContext) : NativeXmaxRuntimeSpec(context), Application.ActivityLifecycleCallbacks {
  companion object { const val NAME = "XmaxRuntime" }
  private val app = context.applicationContext as Application
  private val images = XmaxImageManager(context)
  private val imageVideo = XmaxImageVideoSource(this, File(context.cacheDir, "xmax-images"))
  private val main = Handler(Looper.getMainLooper())
  @Volatile private var started = if (context.lifecycleState == LifecycleState.RESUMED) 1 else 0
  private var owner: String? = null
  private var active = false
  init { app.registerActivityLifecycleCallbacks(this) }
  override fun getName() = NAME
  override fun prepareRuntime(promise: Promise) { promise.resolve(null) }
  @Synchronized override fun acquire(token: String): Boolean {
    if (owner != null || started == 0) return false
    owner = token; active = true; return true
  }
  @Synchronized override fun isActive(token: String): Boolean = owner == token && active
  @Synchronized override fun release(token: String) { if (owner == token) { imageVideo.stop(); active = false; owner = null } }
  override fun randomUUID() = UUID.randomUUID().toString()
  override fun runtimeInfo() = JSONObject().put("platform", "android").put("os_version", Build.VERSION.RELEASE).put("device_model", Build.MODEL).toString()
  override fun requestPermissions(useMicrophone: Boolean, promise: Promise) { promise.resolve("android-use-PermissionsAndroid") }
  override fun imageInfo(fileURL: String, promise: Promise) = images.info(fileURL, promise)

  override fun prepareImage(fileURL: String, width: Double, height: Double, promise: Promise) = images.prepare(fileURL, width, height, promise)

  override fun removePreparedImage(fileURL: String, promise: Promise) = images.remove(fileURL, promise)

  /** Starts only against the engine leased by the matching JS manager. */
  @Synchronized override fun startImageVideo(token: String, path: String, width: Double, height: Double, fps: Double, promise: Promise) {
    try {
      check(isActive(token)) { "Media engine is not active" }
      require(listOf(width, height, fps).all { it.isFinite() && it > 0 && it % 1 == 0.0 } &&
        width * height <= 1280000 && fps <= 60) { "Invalid image video format" }
      val engine = requireNotNull(XmaxRtcEngineAccess.current()) { "RTC engine is unavailable" }
      imageVideo.start(engine, path, width.toInt(), height.toInt(), fps.toInt(), { isActive(token) }, promise)
    } catch (error: Exception) { promise.reject("MEDIA_ERROR", error) }
  }

  @Synchronized override fun stopImageVideo(token: String) {
    if (owner == token) imageVideo.stop()
  }

  @Synchronized private fun stopOwnedEngine() {
    if (owner != null && active) { imageVideo.stop(); active = false; RTCVideo.destroyRTCVideo() }
  }
  override fun invalidate() {
    app.unregisterActivityLifecycleCallbacks(this)
    main.removeCallbacksAndMessages(null)
    stopOwnedEngine()
    imageVideo.invalidate()
    images.invalidate()
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
