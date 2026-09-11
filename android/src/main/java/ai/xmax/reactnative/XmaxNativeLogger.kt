package ai.xmax.reactnative

import android.util.Log

/** Global SDK logging shared by JS calls and native media workers. */
internal object XmaxNativeLogger {
  private var options = 0

  /** Replaces the filter atomically with respect to native log writes. */
  @Synchronized fun configure(value: Int) {
    options = if (value in 0..3) value else 0
  }

  /** Accepts only categorized safe metadata; never pass exception text or credentials. */
  @Synchronized fun write(level: String, message: String, option: Int) {
    if (option <= 0 || options and option != option) return

    when (level) {
      "debug" -> Log.d("XmaxSDK", message)
      "info" -> Log.i("XmaxSDK", message)
      "warn" -> Log.w("XmaxSDK", message)
      "error" -> Log.e("XmaxSDK", message)
    }
  }
}
