package ai.xmax.reactnative

/** Checks native frame values; MediaService owns model buckets and pixel bounds. */
internal object XmaxImageVideoFormat {
  /** Dimensions must fit the RTC frame's signed 32-bit fields. */
  fun isValid(width: Double, height: Double, fps: Double): Boolean =
    listOf(width, height).all {
      it.isFinite() && it > 0 && it % 1 == 0.0 && it <= Int.MAX_VALUE.toDouble()
    } && fps.isFinite() && fps > 0 && fps % 1 == 0.0 && fps <= 60
}
