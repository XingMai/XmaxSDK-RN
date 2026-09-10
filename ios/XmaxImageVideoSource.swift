import CoreMedia
import CoreVideo
import Foundation
import ImageIO
@preconcurrency import VolcEngineRTC

/// Repeats immutable image pixels on a serial worker queue.
///
/// The shared runtime lock protects generation, the timer, and every SDK submission.
/// Pixel data stays native and remains alive while scheduled frames reference it.
final class XmaxImageVideoSource: @unchecked Sendable {
  /// Shared with the runtime so a frame cannot be submitted during engine destruction.
  private let gate: NSRecursiveLock
  private let worker = DispatchQueue(label: "ai.xmax.image-video")

  /// Accessed only while holding gate; cancellation also invalidates queued callbacks.
  private var timer: DispatchSourceTimer?
  private var generation: UInt = 0

  /// Uses the runtime's lock to coordinate startup, frame submission, and shutdown.
  init(gate: NSRecursiveLock) {
    self.gate = gate
  }

  /// Starts the frame source only if decoding completes within the same active lease.
  func start(
    engine: ByteRTCVideo,
    path: String,
    width: Int,
    height: Int,
    fps: Int,
    active: @escaping @Sendable () -> Bool,
    promise: XmaxNativePromise
  ) {
    let token = gate.xmaxWithLock {
      stop()

      return generation
    }

    worker.async {
      autoreleasepool {
        let pixels: CVPixelBuffer

        do {
          pixels = try Self.decode(path: path, width: width, height: height)
        } catch {
          promise.reject(error.localizedDescription, error: error)
          return
        }

        self.gate.xmaxWithLock {
          guard token == self.generation, active() else {
            promise.reject("Image source was cancelled", code: "CANCELLED")
            return
          }

          let push = {
            let frame = ByteRTCVideoFrame()
            frame.format = Int32(ByteRTCVideoPixelFormat.cvPixelBuffer.rawValue)
            frame.textureBuf = pixels
            frame.width = Int32(width)
            frame.height = Int32(height)
            frame.rotation = ByteRTCVideoRotation(rawValue: 0)!
            frame.time = CMClockGetTime(CMClockGetHostTimeClock())

            // Rejected frames do not prevent startup or the next scheduled push.
            _ = engine.pushExternalVideoFrame(frame)
          }

          // Submit immediately; later frames use the same immutable pixels.
          push()

          let interval = DispatchTimeInterval.nanoseconds(1_000_000_000 / fps)
          let timer = DispatchSource.makeTimerSource(queue: self.worker)
          self.timer = timer

          timer.setEventHandler { [weak self] in
            autoreleasepool {
              guard let self else {
                return
              }

              self.gate.xmaxWithLock {
                guard token == self.generation, active() else {
                  return
                }

                push()

                // Match Android's delay after each completed submission.
                self.timer?.schedule(deadline: .now() + interval, leeway: .milliseconds(1))
              }
            }
          }

          timer.schedule(deadline: .now() + interval, leeway: .milliseconds(1))
          timer.resume()

          promise.resolve()
        }
      }
    }
  }

  /// Invalidates pending decoding and cancels delivery before the engine is destroyed.
  func stop() {
    gate.xmaxWithLock {
      generation &+= 1
      timer?.cancel()
      timer = nil
    }
  }

  /// Draws the complete prepared JPEG into a single upright, immutable BGRA buffer.
  private static func decode(path: String, width: Int, height: Int) throws -> CVPixelBuffer {
    let url = URL(fileURLWithPath: path).resolvingSymlinksInPath()

    guard
      url.deletingLastPathComponent().path
        == XmaxImageManager.directory.resolvingSymlinksInPath().path,
      url.pathExtension == "jpg",
      let source = CGImageSourceCreateWithURL(url as CFURL, nil),
      let image = CGImageSourceCreateImageAtIndex(source, 0, nil),
      image.width == width, image.height == height
    else {
      throw XmaxNativeFailure(
        message: "Unable to decode prepared image at the video format dimensions"
      )
    }

    let attributes: [CFString: Any] = [
      kCVPixelBufferCGImageCompatibilityKey: true,
      kCVPixelBufferCGBitmapContextCompatibilityKey: true,
      kCVPixelBufferIOSurfacePropertiesKey: [:],
    ]
    var output: CVPixelBuffer?

    guard
      CVPixelBufferCreate(
        kCFAllocatorDefault,
        width,
        height,
        kCVPixelFormatType_32BGRA,
        attributes as CFDictionary,
        &output
      ) == kCVReturnSuccess,
      let pixels = output,
      CVPixelBufferLockBaseAddress(pixels, []) == kCVReturnSuccess
    else {
      throw XmaxNativeFailure(message: "Unable to allocate image video pixels")
    }
    defer {
      CVPixelBufferUnlockBaseAddress(pixels, [])
    }

    guard let colorSpace = CGColorSpace(name: CGColorSpace.sRGB),
      let context = CGContext(
        data: CVPixelBufferGetBaseAddress(pixels),
        width: width,
        height: height,
        bitsPerComponent: 8,
        bytesPerRow: CVPixelBufferGetBytesPerRow(pixels),
        space: colorSpace,
        bitmapInfo: CGBitmapInfo.byteOrder32Little.rawValue
          | CGImageAlphaInfo.premultipliedFirst.rawValue
      )
    else {
      throw XmaxNativeFailure(message: "Unable to prepare image video pixels")
    }
    context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))

    return pixels
  }
}
