package ai.xmax.reactnative

import com.bytedance.realx.video.JavaI420Buffer
import com.bytedance.realx.video.YuvHelper
import com.ss.bytertc.engine.data.VideoPixelFormat
import com.ss.bytertc.engine.data.VideoRotation
import com.ss.bytertc.engine.video.IVideoProcessor
import com.ss.bytertc.engine.video.VideoFrame
import com.ss.bytertc.engine.video.builder.CpuBufferVideoFrameBuilder

/**
 * Applies capture rotation to pixels before cropping to the requested model size.
 * Uses the pinned RTC native YUV routines; no pixels or per-frame calls cross JS.
 * Returned buffers remain owned by RTC until its release callback fires.
 */
internal class XmaxCameraFrameProcessor(private val width: Int, private val height: Int) : IVideoProcessor() {
  private var lastGeometry: String? = null
  private var failed = false

  override fun processVideoFrame(frame: VideoFrame): VideoFrame? {
    try {
      require(frame.pixelFormat == VideoPixelFormat.I420) { "Expected planar camera frame" }
      val rotation = frame.rotation.value()
      val swapped = rotation == 90 || rotation == 270
      val uprightWidth = if (swapped) frame.height else frame.width
      val uprightHeight = if (swapped) frame.width else frame.height
      val geometry = "${frame.width}x${frame.height}/$rotation"
      if (lastGeometry != geometry) {
        lastGeometry = geometry
        XmaxNativeLogger.write("debug", "[Xmax][Media] Camera normalization: $geometry -> ${width}x${height}/0", 2)
      }
      if (rotation == 0 && frame.width == width && frame.height == height) return frame

      val upright = JavaI420Buffer.allocate(uprightWidth, uprightHeight)
      val output = try {
        YuvHelper.I420Rotate(
          frame.getPlaneData(0), frame.getPlaneStride(0),
          frame.getPlaneData(1), frame.getPlaneStride(1),
          frame.getPlaneData(2), frame.getPlaneStride(2),
          upright.dataY, upright.strideY, upright.dataU, upright.strideU,
          upright.dataV, upright.strideV, frame.width, frame.height, rotation,
        )
        val crop = XmaxCameraFrameLayout.crop(uprightWidth, uprightHeight, width, height)
        val cropped = upright.cropAndScale(crop.x, crop.y, crop.width, crop.height, width, height)
        try { cropped.toI420() } finally { cropped.release() }
      } finally {
        upright.release()
      }
      try {
        return CpuBufferVideoFrameBuilder(VideoPixelFormat.I420)
          .setWidth(width).setHeight(height)
          .setRotation(VideoRotation.VIDEO_ROTATION_0)
          .setTimeStampUs(frame.timeStampUs).setColorSpace(frame.colorSpace)
          .setPlaneData(0, output.dataY).setPlaneStride(0, output.strideY)
          .setPlaneData(1, output.dataU).setPlaneStride(1, output.strideU)
          .setPlaneData(2, output.dataV).setPlaneStride(2, output.strideV)
          .setReleaseCallback { output.release() }
          .build()
      } catch (error: Exception) {
        output.release()
        throw error
      }
    } catch (_: Exception) {
      // Drop an invalid frame rather than publish pixels with incorrect orientation.
      if (!failed) XmaxNativeLogger.write("error", "[Xmax][Media] Camera frame normalization failed", 1)
      failed = true
      return null
    }
  }
}
