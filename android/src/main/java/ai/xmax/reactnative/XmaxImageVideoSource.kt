package ai.xmax.reactnative

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.SystemClock
import android.util.Log
import com.facebook.react.bridge.Promise
import com.ss.bytertc.engine.RTCVideo
import com.ss.bytertc.engine.data.VideoPixelFormat
import com.ss.bytertc.engine.data.VideoRotation
import com.ss.bytertc.engine.video.builder.CpuBufferVideoFrameBuilder
import java.io.File
import java.nio.ByteBuffer
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit

/**
 * Repeats immutable pixels with fresh timestamps without crossing the JS bridge.
 * All pushes and teardown share the runtime gate, so engine destruction cannot
 * race a push. Late file decoding cannot restart a stopped source.
 */
internal class XmaxImageVideoSource(private val gate: Any, private val directory: File) {
  private val worker = Executors.newSingleThreadScheduledExecutor()
  private var generation = 0L
  private var timer: ScheduledFuture<*>? = null

  fun start(
    engine: RTCVideo,
    path: String,
    width: Int,
    height: Int,
    fps: Int,
    active: () -> Boolean,
    promise: Promise,
  ) {
    val token = synchronized(gate) {
      stop()
      generation
    }

    worker.execute {
      try {
        val file = File(path).canonicalFile
        require(file.parentFile == directory.canonicalFile && file.extension == "jpg") {
          "Image source must be a prepared SDK image"
        }
        val options = BitmapFactory.Options().apply {
          inPreferredConfig = Bitmap.Config.ARGB_8888
          inScaled = false
        }
        val bitmap = requireNotNull(BitmapFactory.decodeFile(file.path, options)) {
          "Unable to decode prepared image"
        }
        val pixels: ByteBuffer
        val stride: Int
        try {
          require(bitmap.width == width && bitmap.height == height) {
            "Prepared image dimensions do not match the video format"
          }
          stride = bitmap.rowBytes
          pixels = ByteBuffer.allocateDirect(bitmap.byteCount)
          bitmap.copyPixelsToBuffer(pixels)
          pixels.rewind()
        } finally {
          bitmap.recycle()
        }

        synchronized(gate) {
          check(token == generation && active()) { "Image source was cancelled" }

          fun push() {
            val frame = CpuBufferVideoFrameBuilder(VideoPixelFormat.RGBA)
              .setWidth(width)
              .setHeight(height)
              .setRotation(VideoRotation.VIDEO_ROTATION_0)
              .setTimeStampUs(SystemClock.elapsedRealtimeNanos() / 1000)
              .setPlaneData(0, pixels.duplicate())
              .setPlaneStride(0, stride)
              // Retain the shared immutable storage until the SDK releases this frame.
              .setReleaseCallback { pixels.capacity() }
              .build()
            try {
              check(engine.pushExternalVideoFrame(frame) == 0) { "Unable to push image frame" }
            } finally {
              frame.release()
            }
          }

          push()
          val interval = 1_000_000_000L / fps
          timer = worker.scheduleWithFixedDelay({
            synchronized(gate) {
              if (token == generation && active()) {
                try {
                  push()
                } catch (error: Exception) {
                  Log.e("XmaxSDK", "Native image frame delivery failed", error)
                  stop()
                }
              }
            }
          }, interval, interval, TimeUnit.NANOSECONDS)
          promise.resolve(null)
        }
      } catch (error: Exception) {
        promise.reject("MEDIA_ERROR", error)
      } catch (error: OutOfMemoryError) {
        promise.reject("MEDIA_ERROR", "Insufficient memory for image video source", error)
      }
    }
  }

  /** Cancels future pushes before the runtime destroys the shared RTC engine. */
  fun stop() = synchronized(gate) {
    generation++
    timer?.cancel(false)
    timer = null
  }

  fun invalidate() = synchronized(gate) {
    stop()
    worker.shutdown()
  }
}
