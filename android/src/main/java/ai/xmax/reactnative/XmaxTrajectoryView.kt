package ai.xmax.reactnative

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.RadialGradient
import android.graphics.Shader
import android.view.Choreographer
import android.view.View
import android.view.ViewGroup
import org.json.JSONObject
import java.lang.ref.WeakReference
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sin

/** One Canvas draws the entire effect; positions and radii are expressed in React viewport dp. */
internal class XmaxTrajectoryView(context: Context) : View(context), Choreographer.FrameCallback {
  private data class Finger(var x: Float, var y: Float, val core: Int, val glow: Int, val began: Double)
  private val fingers = linkedMapOf<String, Finger>()
  private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
  private val fadePaint = Paint().apply { xfermode = PorterDuffXfermode(PorterDuff.Mode.DST_OUT) }
  private val pixelScale = resources.displayMetrics.density
  private var bitmap: Bitmap? = null
  private var trailCanvas: Canvas? = null
  private var hasTrail = false
  private var scheduled = false
  private var lastTick = 0.0
  private var lastMove = 0.0
  private var host = WeakReference<ViewGroup>(null)
  private val layoutListener = OnLayoutChangeListener { view, _, _, _, _, _, _, _, _ ->
    layout(0, 0, view.width, view.height)
  }

  init { isClickable = false; isFocusable = false; importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO }

  companion object {
    /** The runtime verifies the React nativeID before passing a host here. */
    fun renderIn(host: ViewGroup, command: String) {
      val value = try { JSONObject(command) } catch (_: Exception) { return }
      var canvas = (0 until host.childCount).map { host.getChildAt(it) }.filterIsInstance<XmaxTrajectoryView>().firstOrNull()
      if (value.optString("action") == "detach") {
        canvas?.dispose()
        if (canvas != null) host.removeView(canvas)
        return
      }
      if (canvas == null) {
        canvas = XmaxTrajectoryView(host.context)
        canvas.host = WeakReference(host)
        host.addView(canvas, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        canvas.layout(0, 0, host.width, host.height)
      }
      canvas.apply(value)
    }

    private fun now() = System.nanoTime() / 1_000_000_000.0

    private fun color(text: String, fallback: Int): Int = try { Color.parseColor(text) } catch (_: IllegalArgumentException) { fallback }

    private fun alpha(color: Int, alpha: Double): Int = (color and 0x00ffffff) or ((alpha.coerceIn(0.0, 1.0) * 255).toInt() shl 24)
  }

  private fun apply(value: JSONObject) {
    when (val action = value.optString("action")) {
      "reset" -> { reset(); return }
      "end" -> {
        val ids = value.optJSONArray("ids")
        if (ids != null) for (index in 0 until ids.length()) fingers.remove(ids.optString(index))
      }
      "begin", "move" -> {
        val points = value.optJSONArray("points")
        if (points != null) for (index in 0 until points.length()) {
          val point = points.optJSONObject(index) ?: continue
          val id = point.optString("id")
          val x = point.optDouble("x").toFloat(); val y = point.optDouble("y").toFloat()
          if (!x.isFinite() || !y.isFinite()) continue
          val finger = fingers[id]
          if (action == "move" && finger != null) {
            drawSegment(finger, x, y)
            finger.x = x; finger.y = y
          } else if (action == "begin") {
            fingers[id] = Finger(x, y, color(point.optString("core"), Color.WHITE), color(point.optString("glow"), Color.GREEN), now())
          }
        }
      }
    }
    start()
    invalidate()
  }

  /** Pixel conversion happens exactly once, at the Canvas boundary. */
  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    bitmap?.recycle(); bitmap = null; trailCanvas = null; hasTrail = false
    if (w > 0 && h > 0) {
      val image = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
      bitmap = image
      trailCanvas = Canvas(image).apply { scale(pixelScale, pixelScale) }
    }
  }

  private fun drawSegment(finger: Finger, x: Float, y: Float) {
    val canvas = trailCanvas ?: return
    paint.reset(); paint.isAntiAlias = true; paint.strokeCap = Paint.Cap.ROUND; paint.style = Paint.Style.STROKE
    for ((width, opacity, blur) in arrayOf(Triple(18f, 0.22, 12f), Triple(10f, 0.52, 6f), Triple(3f, 0.82, 0f))) {
      paint.strokeWidth = width
      paint.color = alpha(if (width == 3f) finger.core else finger.glow, opacity)
      if (blur > 0) paint.setShadowLayer(blur, 0f, 0f, paint.color) else paint.clearShadowLayer()
      canvas.drawLine(finger.x, finger.y, x, y, paint)
    }
    paint.clearShadowLayer()
    hasTrail = true; lastMove = now()
  }

  private fun start() {
    if (scheduled || !isAttachedToWindow || windowVisibility != VISIBLE || (fingers.isEmpty() && !hasTrail)) return
    scheduled = true; lastTick = now()
    Choreographer.getInstance().postFrameCallback(this)
  }

  override fun doFrame(frameTimeNanos: Long) {
    scheduled = false
    if (!isAttachedToWindow || windowVisibility != VISIBLE) { reset(); return }
    val time = frameTimeNanos / 1_000_000_000.0
    if (hasTrail) {
      fadePaint.color = alpha(Color.BLACK, 1 - 0.95.pow((time - lastTick).coerceAtLeast(0.0) * 60))
      trailCanvas?.drawRect(0f, 0f, width / pixelScale, height / pixelScale, fadePaint)
      if (time - lastMove > 64.0 / 60) { bitmap?.eraseColor(Color.TRANSPARENT); hasTrail = false }
    }
    lastTick = time
    invalidate()
    if (fingers.isNotEmpty() || hasTrail) {
      scheduled = true
      Choreographer.getInstance().postFrameCallback(this)
    }
  }

  override fun onDraw(canvas: Canvas) {
    bitmap?.let { canvas.drawBitmap(it, 0f, 0f, null) }
    canvas.save()
    canvas.scale(pixelScale, pixelScale)
    val time = now()
    for (finger in fingers.values) {
      val elapsed = time - finger.began
      val pulse = (sin(elapsed * 1.2 * PI * 2) + 1) / 2
      paint.reset(); paint.isAntiAlias = true; paint.style = Paint.Style.STROKE; paint.strokeWidth = 2f
      for (index in 0..1) {
        val phase = if (index == 0) pulse else 1 - pulse
        paint.color = alpha(finger.glow, 0.5 * (1 - index * 0.2) * (0.5 + phase * 0.5))
        canvas.drawCircle(finger.x, finger.y, (14 + index * 18 + phase * 8).toFloat(), paint)
      }
      for (index in 0..3) {
        val direction = if (index % 2 == 0) 1 else -1
        val angle = index / 4.0 * PI * 2 + elapsed * 0.06 * direction
        glow(canvas, finger.x + cos(angle).toFloat() * 22, finger.y + sin(angle).toFloat() * 22, 6f, finger.glow,
          0.6 * (0.6 + sin(elapsed * 3 + index) * 0.4))
      }
      glow(canvas, finger.x, finger.y, (14 + pulse * 4).toFloat(), finger.glow, 0.65 + pulse * 0.25)
      paint.shader = null; paint.color = finger.core; paint.style = Paint.Style.FILL
      canvas.drawCircle(finger.x, finger.y, 5f, paint)
    }
    canvas.restore()
  }

  private fun glow(canvas: Canvas, x: Float, y: Float, radius: Float, color: Int, opacity: Double) {
    paint.reset(); paint.isAntiAlias = true
    paint.shader = RadialGradient(x, y, radius, intArrayOf(alpha(color, opacity), alpha(color, opacity * 0.6), alpha(color, 0.0)), floatArrayOf(0f, 0.4f, 1f), Shader.TileMode.CLAMP)
    canvas.drawCircle(x, y, radius, paint)
    paint.shader = null
  }

  private fun reset() {
    Choreographer.getInstance().removeFrameCallback(this)
    scheduled = false; fingers.clear(); bitmap?.eraseColor(Color.TRANSPARENT); hasTrail = false
    invalidate()
  }

  private fun dispose() {
    reset()
    host.get()?.removeOnLayoutChangeListener(layoutListener)
    bitmap?.recycle(); bitmap = null; trailCanvas = null
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    host.get()?.addOnLayoutChangeListener(layoutListener)
    if (bitmap == null && width > 0 && height > 0) onSizeChanged(width, height, 0, 0)
  }

  override fun onDetachedFromWindow() { dispose(); super.onDetachedFromWindow() }

  override fun onWindowVisibilityChanged(visibility: Int) {
    super.onWindowVisibilityChanged(visibility)
    if (visibility != VISIBLE) reset()
  }
}
