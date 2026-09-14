import UIKit

/// A single UIKit canvas for trails and concentric breathing light in viewport points.
@MainActor
@objc(XmaxTrajectoryView)
public final class XmaxTrajectoryView: UIView {
  private struct Finger {
    var point: CGPoint
    let core: UIColor
    let glow: UIColor
    let began: CFTimeInterval
  }

  /// A weak target lets removing the host release the canvas and its display link.
  @MainActor
  private final class TickTarget: NSObject {
    weak var view: XmaxTrajectoryView?

    @objc
    func tick(_ link: CADisplayLink) {
      view?.tick(link.timestamp)
    }
  }

  private var fingers: [String: Finger] = [:]
  private var bitmap: CGContext?
  private var bitmapSize: CGSize = .zero
  private var bitmapScale: CGFloat = 0
  private var lastTick: CFTimeInterval = 0
  private var lastMove: CFTimeInterval = 0
  private var hasTrail = false
  private var displayLink: CADisplayLink?
  private let tickTarget = TickTarget()

  /// Applies commands only inside the host verified by the RN registry adapter.
  @objc(renderIn:command:)
  public static func render(in host: UIView, command: String) {
    guard let data = command.data(using: .utf8),
      let value = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      let action = value["action"] as? String
    else { return }

    let existing = host.subviews.compactMap { $0 as? XmaxTrajectoryView }.first
    if action == "detach" {
      existing?.reset()
      existing?.removeFromSuperview()
      return
    }
    let canvas = existing ?? XmaxTrajectoryView(frame: host.bounds)
    if existing == nil {
      canvas.autoresizingMask = [.flexibleWidth, .flexibleHeight]
      host.addSubview(canvas)
    }
    canvas.apply(action, value: value)
  }

  public override init(frame: CGRect) {
    super.init(frame: frame)
    backgroundColor = .clear
    isOpaque = false
    isUserInteractionEnabled = false
    tickTarget.view = self
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(reset),
      name: UIApplication.didEnterBackgroundNotification,
      object: nil
    )
  }

  /// Canvas instances are created programmatically inside the verified RN host.
  @available(*, unavailable)
  public required init?(coder: NSCoder) { fatalError("init(coder:) is unavailable") }

  isolated deinit {
    displayLink?.invalidate()
    NotificationCenter.default.removeObserver(self)
  }

  public override func didMoveToWindow() {
    super.didMoveToWindow()
    if window == nil { reset() }
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    prepareBitmap()
  }

  /// Keeps all positions in the host's coordinate space; no translated child views.
  private func apply(_ action: String, value: [String: Any]) {
    if action == "reset" { reset(); return }
    if action == "end" {
      for id in value["ids"] as? [String] ?? [] { fingers.removeValue(forKey: id) }
    } else if action == "begin" || action == "move" {
      for item in value["points"] as? [[String: Any]] ?? [] {
        guard let id = item["id"] as? String,
          let x = item["x"] as? Double, let y = item["y"] as? Double,
          x.isFinite, y.isFinite
        else { continue }
        let point = CGPoint(x: x, y: y)
        if var finger = fingers[id], action == "move" {
          drawSegment(from: finger.point, to: point, finger: finger)
          finger.point = point
          fingers[id] = finger
        } else if action == "begin" {
          fingers[id] = Finger(
            point: point,
            core: Self.color(item["core"], fallback: .white),
            glow: Self.color(item["glow"], fallback: .green),
            began: CACurrentMediaTime()
          )
        }
      }
    }
    start()
    setNeedsDisplay()
  }

  /// Parses SDK palette hex colors once per finger, outside the animation loop.
  private static func color(_ value: Any?, fallback: UIColor) -> UIColor {
    guard let text = value as? String, text.count == 7, text.first == "#",
      let hex = UInt32(text.dropFirst(), radix: 16)
    else { return fallback }
    return UIColor(
      red: CGFloat((hex >> 16) & 255) / 255,
      green: CGFloat((hex >> 8) & 255) / 255,
      blue: CGFloat(hex & 255) / 255,
      alpha: 1
    )
  }

  /// Resets both visual state and native animation resources on cancellation/background.
  @objc
  private func reset() {
    fingers.removeAll()
    bitmap?.clear(bounds)
    hasTrail = false
    displayLink?.invalidate()
    displayLink = nil
    lastTick = 0
    setNeedsDisplay()
  }

  private func start() {
    guard displayLink == nil, window != nil, !fingers.isEmpty || hasTrail else { return }
    let link = CADisplayLink(target: tickTarget, selector: #selector(TickTarget.tick(_:)))
    link.preferredFramesPerSecond = 60
    link.add(to: .main, forMode: .common)
    lastTick = CACurrentMediaTime()
    displayLink = link
  }

  private func tick(_ now: CFTimeInterval) {
    if hasTrail, let bitmap {
      bitmap.saveGState()
      bitmap.setBlendMode(.destinationOut)
      bitmap.setFillColor(
        UIColor.black.withAlphaComponent(1 - pow(0.95, max(0, now - lastTick) * 60)).cgColor
      )
      bitmap.fill(bounds)
      bitmap.restoreGState()
      if now - lastMove > 64.0 / 60 {
        bitmap.clear(bounds)
        hasTrail = false
      }
    }
    lastTick = now
    setNeedsDisplay()
    if fingers.isEmpty, !hasTrail {
      displayLink?.invalidate()
      displayLink = nil
    }
  }

  /// One fixed-size trail bitmap replaces the growing React segment hierarchy.
  private func prepareBitmap() {
    let scale = window?.screen.scale ?? traitCollection.displayScale
    guard bounds.width > 0, bounds.height > 0 else { return }
    guard bitmap == nil || bitmapSize != bounds.size || bitmapScale != scale else { return }
    bitmapSize = bounds.size
    bitmapScale = scale
    let width = Int(ceil(bounds.width * scale)), height = Int(ceil(bounds.height * scale))
    bitmap = CGContext(
      data: nil,
      width: width,
      height: height,
      bitsPerComponent: 8,
      bytesPerRow: width * 4,
      space: CGColorSpaceCreateDeviceRGB(),
      bitmapInfo: CGBitmapInfo.byteOrder32Big.rawValue | CGImageAlphaInfo.premultipliedLast.rawValue
    )
    bitmap?.translateBy(x: 0, y: CGFloat(height))
    bitmap?.scaleBy(x: scale, y: -scale)
    hasTrail = false
  }

  private func drawSegment(from: CGPoint, to: CGPoint, finger: Finger) {
    prepareBitmap()
    guard let context = bitmap else { return }
    context.saveGState()
    context.setBlendMode(.plusLighter)
    context.setLineCap(.round)
    for (width, alpha, blur): (CGFloat, CGFloat, CGFloat) in [
      (18, 0.22, 12), (10, 0.52, 6), (3, 0.82, 0),
    ] {
      let color = (width == 3 ? finger.core : finger.glow).withAlphaComponent(alpha)
      context.setStrokeColor(color.cgColor)
      context.setLineWidth(width)
      context.setShadow(offset: .zero, blur: blur, color: blur > 0 ? color.cgColor : nil)
      context.beginPath()
      context.move(to: from)
      context.addLine(to: to)
      context.strokePath()
    }
    context.restoreGState()
    hasTrail = true
    lastMove = CACurrentMediaTime()
  }

  public override func draw(_ rect: CGRect) {
    if let image = bitmap?.makeImage() {
      UIImage(cgImage: image, scale: bitmapScale, orientation: .up).draw(in: bounds)
    }
    guard let context = UIGraphicsGetCurrentContext() else { return }
    let now = CACurrentMediaTime()
    context.setBlendMode(.plusLighter)
    for finger in fingers.values {
      let elapsed = now - finger.began
      let pulse = (sin(elapsed * 1.2 * .pi * 2) + 1) / 2
      for index in 0..<2 {
        let phase = index == 0 ? pulse : 1 - pulse
        let radius = 14 + Double(index) * 18 + phase * 8
        context.setLineWidth(2)
        context.setStrokeColor(
          finger.glow.withAlphaComponent(0.5 * (1 - Double(index) * 0.2) * (0.5 + phase * 0.5))
            .cgColor
        )
        context.strokeEllipse(in: circle(finger.point, radius: radius))
      }
      for index in 0..<4 {
        let direction: Double = index.isMultiple(of: 2) ? 1 : -1
        let angle = Double(index) / 4 * .pi * 2 + elapsed * 0.06 * direction
        let point = CGPoint(
          x: finger.point.x + cos(angle) * 22,
          y: finger.point.y + sin(angle) * 22
        )
        glow(
          context,
          at: point,
          radius: 6,
          color: finger.glow,
          alpha: 0.6 * (0.6 + sin(elapsed * 3 + Double(index)) * 0.4)
        )
      }
      // The central halo breathes at the same origin as both rings and the trail endpoint.
      glow(
        context,
        at: finger.point,
        radius: 14 + pulse * 4,
        color: finger.glow,
        alpha: 0.65 + pulse * 0.25
      )
      context.setFillColor(finger.core.cgColor)
      context.fillEllipse(in: circle(finger.point, radius: 5))
    }
  }

  private func circle(_ point: CGPoint, radius: CGFloat) -> CGRect {
    CGRect(x: point.x - radius, y: point.y - radius, width: radius * 2, height: radius * 2)
  }

  private func glow(
    _ context: CGContext,
    at point: CGPoint,
    radius: CGFloat,
    color: UIColor,
    alpha: CGFloat
  ) {
    guard
      let gradient = CGGradient(
        colorsSpace: CGColorSpaceCreateDeviceRGB(),
        colors: [
          color.withAlphaComponent(alpha).cgColor, color.withAlphaComponent(alpha * 0.6).cgColor,
          color.withAlphaComponent(0).cgColor,
        ] as CFArray,
        locations: [0, 0.4, 1]
      )
    else { return }
    context.drawRadialGradient(
      gradient,
      startCenter: point,
      startRadius: 0,
      endCenter: point,
      endRadius: radius,
      options: []
    )
  }
}
