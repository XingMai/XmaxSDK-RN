import Foundation
import ImageIO
@preconcurrency import UIKit

/// Decodes local images and owns their prepared cache files; pixels never cross JS.
///
/// Decoding and disk I/O run on worker queues. The lock protects cache ownership
/// against invalidation, so a late preparation cannot leave an orphaned file.
final class XmaxImageManager: @unchecked Sendable {
  /// Protects owned and invalidated; image decoding does not hold this lock.
  private let gate = NSRecursiveLock()
  private var owned = Set<URL>()
  private var invalidated = false

  /// The only directory where this component may create or remove prepared images.
  static var directory: URL {
    FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("xmax-images", isDirectory: true)
  }

  /// Accepts local file URLs and absolute paths; remote URLs are rejected.
  private static func localURL(_ value: String) -> URL? {
    let url = value.hasPrefix("/") ? URL(fileURLWithPath: value) : URL(string: value)

    return url?.isFileURL == true ? url : nil
  }

  /// Opens ImageIO without eagerly caching the original full-resolution pixels.
  private static func source(_ value: String) -> CGImageSource? {
    guard let url = localURL(value) else {
      return nil
    }

    return CGImageSourceCreateWithURL(
      url as CFURL,
      [kCGImageSourceShouldCache: false] as CFDictionary
    )
  }

  /// Reads oriented dimensions without fully decoding the original image.
  func info(_ fileURL: String, promise: XmaxNativePromise) {
    DispatchQueue.global(qos: .userInitiated).async {
      autoreleasepool {
        guard let source = Self.source(fileURL),
          let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
          let width = properties[kCGImagePropertyPixelWidth] as? Int,
          let height = properties[kCGImagePropertyPixelHeight] as? Int,
          width > 0, height > 0
        else {
          promise.reject("Unable to read local image dimensions")
          return
        }

        let orientation = properties[kCGImagePropertyOrientation] as? Int ?? 1
        let rotated = (5...8).contains(orientation)
        let size = ["width": rotated ? height : width, "height": rotated ? width : height]

        do {
          let data = try JSONSerialization.data(withJSONObject: size)
          promise.resolve(String(decoding: data, as: UTF8.self))
        } catch {
          promise.reject("Unable to read local image dimensions", error: error)
        }
      }
    }
  }

  /// Applies EXIF orientation and the requested centered crop to a private JPEG.
  func prepare(_ fileURL: String, width: Double, height: Double, promise: XmaxNativePromise) {
    DispatchQueue.global(qos: .userInitiated).async {
      autoreleasepool {
        // Model buckets and pixel bounds are resolved by MediaService before preparation.
        guard width.isFinite, height.isFinite, width > 0, height > 0,
          width.rounded(.down) == width, height.rounded(.down) == height
        else {
          promise.reject("Invalid prepared image dimensions")
          return
        }

        guard let source = Self.source(fileURL) else {
          promise.reject("Unable to open local image")
          return
        }

        let options: [CFString: Any] = [
          kCGImageSourceCreateThumbnailFromImageAlways: true,
          kCGImageSourceCreateThumbnailWithTransform: true,
          kCGImageSourceShouldCacheImmediately: true,
          kCGImageSourceThumbnailMaxPixelSize: 4096,
        ]
        guard let decoded = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary)
        else {
          promise.reject("Unable to decode local image")
          return
        }

        let image = UIImage(cgImage: decoded)
        let scale = max(width / image.size.width, height / image.size.height)
        let target = CGRect(
          x: (width - image.size.width * scale) / 2,
          y: (height - image.size.height * scale) / 2,
          width: image.size.width * scale,
          height: image.size.height * scale
        )

        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        format.opaque = true

        let renderer = UIGraphicsImageRenderer(
          size: CGSize(width: width, height: height),
          format: format
        )
        let data = renderer.jpegData(withCompressionQuality: 0.95) { context in
          UIColor.black.setFill()
          context.fill(CGRect(x: 0, y: 0, width: width, height: height))
          image.draw(in: target)
        }

        let output = Self.directory.appendingPathComponent(UUID().uuidString + ".jpg")

        do {
          try FileManager.default.createDirectory(
            at: Self.directory,
            withIntermediateDirectories: true
          )
          try data.write(to: output, options: .atomic)
        } catch {
          try? FileManager.default.removeItem(at: output)
          promise.reject("Unable to save prepared image", error: error)
          return
        }

        self.gate.xmaxWithLock {
          guard !self.invalidated else {
            try? FileManager.default.removeItem(at: output)
            promise.reject("Image runtime has been released")
            return
          }

          self.owned.insert(output)

          promise.resolve(output.absoluteString)
        }
      }
    }
  }

  /// Removes only prepared SDK JPEGs; a missing file is already considered released.
  func remove(_ fileURL: String, promise: XmaxNativePromise) {
    DispatchQueue.global(qos: .utility).async {
      guard let url = Self.localURL(fileURL)?.resolvingSymlinksInPath(),
        url.deletingLastPathComponent().path == Self.directory.resolvingSymlinksInPath().path,
        url.pathExtension == "jpg"
      else {
        promise.reject("Refusing to remove an image outside SDK cache")
        return
      }

      do {
        try FileManager.default.removeItem(at: url)
      } catch let error as NSError
        where error.domain == NSCocoaErrorDomain && error.code == NSFileNoSuchFileError
      {
        // Removal is idempotent.
      } catch {
        promise.reject("Unable to remove prepared image", error: error)
        return
      }

      self.gate.xmaxWithLock {
        if let original = Self.localURL(fileURL) {
          self.owned.remove(original)
        }
      }

      promise.resolve()
    }
  }

  /// Runs after engine destruction; late preparation deletes its own result.
  func invalidate() {
    gate.xmaxWithLock {
      invalidated = true

      for url in owned {
        try? FileManager.default.removeItem(at: url)
      }

      owned.removeAll()
    }
  }
}
