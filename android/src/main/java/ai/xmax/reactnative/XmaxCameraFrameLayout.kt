package ai.xmax.reactnative

/** Even, centered crop coordinates for planar YUV after applying frame rotation. */
internal data class XmaxCameraFrameLayout(val x: Int, val y: Int, val width: Int, val height: Int) {
  companion object {
    fun crop(width: Int, height: Int, targetWidth: Int, targetHeight: Int): XmaxCameraFrameLayout {
      require(listOf(width, height, targetWidth, targetHeight).all { it >= 2 && it % 2 == 0 })
      val cropWidth: Int
      val cropHeight: Int
      if (width.toLong() * targetHeight > height.toLong() * targetWidth) {
        cropWidth = ((height.toLong() * targetWidth / targetHeight).toInt() / 2 * 2).coerceAtLeast(2)
        cropHeight = height
      } else {
        cropWidth = width
        cropHeight = ((width.toLong() * targetHeight / targetWidth).toInt() / 2 * 2).coerceAtLeast(2)
      }
      return XmaxCameraFrameLayout(
        (width - cropWidth) / 4 * 2, (height - cropHeight) / 4 * 2, cropWidth, cropHeight,
      )
    }
  }
}
