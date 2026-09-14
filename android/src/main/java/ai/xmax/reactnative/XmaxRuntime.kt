package ai.xmax.reactnative
import com.facebook.react.uimanager.UIManagerHelper
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
import com.volcengine.reactnative.vertc.events.IRTCVideoEventHandlerImpl
import org.json.JSONObject
import java.util.UUID
import java.io.File
import java.util.concurrent.Executors

@ReactModule(name = XmaxRuntime.NAME)
class XmaxRuntime(private val context: ReactApplicationContext) : NativeXmaxRuntimeSpec(context), Application.ActivityLifecycleCallbacks {
  companion object { const val NAME = "XmaxRuntime" }
  private val app = context.applicationContext as Application
  private val files = Executors.newSingleThreadExecutor()
  private val images = XmaxImageManager(context)
  private val imageVideo = XmaxImageVideoSource(this, File(context.cacheDir, "xmax-images"))
  private val main = Handler(Looper.getMainLooper())
  @Volatile private var started = if (context.lifecycleState == LifecycleState.RESUMED) 1 else 0
  private var owner: String? = null
  private var active = false
  private var rtcEvents: XmaxRtcEventAdapter? = null
  init { app.registerActivityLifecycleCallbacks(this) }
  override fun getName() = NAME

  /** Applies the same global filter to JS messages and worker diagnostics. */
  override fun configureLogging(options: Double) {
    XmaxNativeLogger.configure(options.toInt())
  }

  /** Writes preformatted JS diagnostics without emitting an RN console error. */
  override fun writeLog(level: String, message: String, option: Double) {
    XmaxNativeLogger.write(level, message, option.toInt())
  }

  /** Acknowledges native UI hiding before JS is allowed to tear down the RTC room. */
  override fun hideVideoContainer(reactTag: Double, nativeID: String, promise: Promise) {
    main.post {
      try {
        val tag = reactTag.toInt()
        val view = UIManagerHelper.getUIManager(context, tag)?.resolveView(tag)
        if (view?.getTag(com.facebook.react.R.id.view_tag_native_id) == nativeID) {
          // Match the React opacity prop so recycling does not retain hidden visibility.
          view.alpha = 0f
        }
        promise.resolve(null)
      } catch (_: com.facebook.react.uimanager.IllegalViewOperationException) {
        // Already unmounted: there is no remote container left to cover the preview.
        promise.resolve(null)
      } catch (error: Exception) {
        promise.reject("INTERNAL_ERROR", "Unable to hide video container", error)
      }
    }
  }

  override fun prepareRuntime(promise: Promise) { promise.resolve(null) }
  @Synchronized override fun acquire(token: String): Boolean {
    if (owner != null || started == 0) return false
    owner = token; active = true; return true
  }
  @Synchronized override fun isActive(token: String): Boolean = owner == token && active
  @Synchronized override fun release(token: String) { if (owner == token) { closeRtcEvents(); imageVideo.stop(); active = false; owner = null } }

  /** Adapts only the event handler belonging to the current media lease. */
  @Synchronized override fun adaptRtcVideoEvents(token: String): Boolean {
    if (!isActive(token)) return false
    val handler = XmaxRtcEngineAccess.currentHandler() as? IRTCVideoEventHandlerImpl ?: return false
    val adapter = XmaxRtcEventAdapter.install(handler)
    if (rtcEvents !== adapter) {
      rtcEvents?.close()
      rtcEvents = adapter
    }
    return true
  }

  /** Invalidates pending event delivery before native teardown starts. */
  private fun closeRtcEvents() {
    rtcEvents?.close()
    rtcEvents = null
  }
  override fun randomUUID() = UUID.randomUUID().toString()
  override fun runtimeInfo() = JSONObject().put("platform", "android").put("os_version", Build.VERSION.RELEASE).put("device_model", Build.MODEL).toString()
  override fun requestPermissions(useMicrophone: Boolean, promise: Promise) { promise.resolve("android-use-PermissionsAndroid") }
  /** Keeps file I/O off the UI thread and independent of realtime generation. */
  override fun replaceFile(sourcePath: String, destinationPath: String, promise: Promise) {
    try {
      files.execute {
        try {
          XmaxFileCommit.replace(sourcePath, destinationPath)
          promise.resolve(null)
        } catch (error: Exception) {
          promise.reject("DOWNLOAD_ERROR", "Unable to commit downloaded file", error)
        }
      }
    } catch (error: java.util.concurrent.RejectedExecutionException) {
      promise.reject("DOWNLOAD_ERROR", "Storage runtime is unavailable", error)
    }
  }

  override fun imageInfo(fileURL: String, promise: Promise) = images.info(fileURL, promise)

  override fun prepareImage(fileURL: String, width: Double, height: Double, promise: Promise) = images.prepare(fileURL, width, height, promise)

  override fun removePreparedImage(fileURL: String, promise: Promise) = images.remove(fileURL, promise)

  /** Starts only against the engine leased by the matching JS manager. */
  @Synchronized override fun startImageVideo(token: String, path: String, width: Double, height: Double, fps: Double, promise: Promise) {
    try {
      check(isActive(token)) { "Media engine is not active" }
      require(XmaxImageVideoFormat.isValid(width, height, fps)) { "Invalid image video format" }
      val engine = requireNotNull(XmaxRtcEngineAccess.current()) { "RTC engine is unavailable" }
      imageVideo.start(engine, path, width.toInt(), height.toInt(), fps.toInt(), { isActive(token) }, promise)
    } catch (error: Exception) { promise.reject("MEDIA_ERROR", error) }
  }

  /** Updates frame metadata before JS sends the corresponding room command. */
  @Synchronized override fun setImageVideoTask(token: String, taskID: String): Boolean {
    if (owner != token || (taskID.isNotEmpty() && !isActive(token))) return false
    return imageVideo.setTask(taskID)
  }

  @Synchronized override fun stopImageVideo(token: String) {
    if (owner == token) imageVideo.stop()
  }

  @Synchronized private fun stopOwnedEngine() {
    if (owner != null && active) {
      XmaxNativeLogger.write("info", "[Xmax][Media] Releasing owned capture", 1)
      closeRtcEvents(); imageVideo.stop(); active = false; RTCVideo.destroyRTCVideo() }
  }
  override fun invalidate() {
    app.unregisterActivityLifecycleCallbacks(this)
    main.removeCallbacksAndMessages(null)
    stopOwnedEngine()
    imageVideo.invalidate()
    images.invalidate()
    files.shutdown()
    XmaxNativeLogger.configure(0)
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
