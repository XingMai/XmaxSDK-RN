import AVFoundation
import Foundation
@preconcurrency import React
@preconcurrency import UIKit
@preconcurrency import VolcEngineRTC

/// Owns permissions, prepared images, and the native media lease behind the TurboModule adapter.
///
/// Construction is safe on the JS thread. UIKit state is read asynchronously by
/// prepareRuntime(), while the shared recursive lock protects all mutable lease state.
/// The class is exported to Objective-C only for the internal RN bridge.
@objc(XmaxRuntimeImplementation)
public final class XmaxRuntimeImplementation: NSObject, @unchecked Sendable {
  // MARK: - Native services

  /// Serializes lease changes with frame submission and engine destruction.
  private let gate = NSRecursiveLock()
  private let images = XmaxImageManager()
  private let imageVideo: XmaxImageVideoSource

  /// A thread-independent snapshot, returned by synchronous JS metadata calls.
  private let metadata: String

  // MARK: - Lease state

  /// The owning manager's token; all lease fields below are protected by gate.
  private var owner: String?
  private var active = false
  private var foreground = false
  private var invalidated = false

  // MARK: - Initialization

  /// Creates native services and observes lifecycle changes without accessing UIKit state.
  public override init() {
    imageVideo = XmaxImageVideoSource(gate: gate)

    // Codegen may instantiate this object on the JS thread. Metadata needs no UIKit access.
    var info = utsname()
    uname(&info)

    let model = withUnsafeBytes(of: &info.machine) {
      String(decoding: $0.prefix { $0 != 0 }, as: UTF8.self)
    }

    let version = ProcessInfo.processInfo.operatingSystemVersion
    var components = [version.majorVersion, version.minorVersion]

    if version.patchVersion != 0 {
      components.append(version.patchVersion)
    }

    let data = try! JSONSerialization.data(withJSONObject: [
      "platform": "ios",
      "os_version": components.map(String.init).joined(separator: "."),
      "device_model": model,
    ])
    metadata = String(decoding: data, as: UTF8.self)

    super.init()

    NotificationCenter.default.addObserver(
      self,
      selector: #selector(didEnterBackground),
      name: UIApplication.didEnterBackgroundNotification,
      object: nil
    )
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(willEnterForeground),
      name: UIApplication.willEnterForegroundNotification,
      object: nil
    )
  }

  // MARK: - Runtime lifecycle

  /// Reads UIKit state on the main queue before a manager attempts to acquire the engine.
  ///
  /// Resolves once the foreground snapshot is ready. Invalidating the runtime while
  /// this operation is pending rejects with CANCELLED and cannot reactivate the runtime.
  @objc(prepareRuntime:reject:)
  public func prepareRuntime(
    _ resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    let promise = XmaxNativePromise(resolve: resolve, reject: reject)

    DispatchQueue.main.async {
      let isForeground = UIApplication.shared.applicationState != .background

      self.gate.xmaxWithLock {
        guard !self.invalidated else {
          promise.reject("Media runtime has been released", code: "CANCELLED")
          return
        }

        self.foreground = isForeground

        promise.resolve()
      }
    }
  }

  /// Stops frame delivery before destroying an engine owned by this runtime.
  @objc
  private func didEnterBackground() {
    gate.xmaxWithLock {
      foreground = false

      if owner != nil && active {
        imageVideo.stop()
        active = false
        ByteRTCVideo.destroyRTCVideo()
      }
    }
  }

  /// Allows a later explicit media request; returning to the foreground does not restart it.
  @objc
  private func willEnterForeground() {
    gate.xmaxWithLock {
      foreground = true
    }
  }

  /// Stops native delivery before destroying the engine and clearing owned image files.
  @objc
  public func invalidate() {
    NotificationCenter.default.removeObserver(self)

    gate.xmaxWithLock {
      invalidated = true
      imageVideo.stop()

      if owner != nil && active {
        ByteRTCVideo.destroyRTCVideo()
      }

      active = false
      owner = nil
    }

    images.invalidate()
  }

  // MARK: - Media ownership

  /// Acquires the exclusive media lease after prepareRuntime() has completed.
  /// Returns false when another manager owns the engine, the app is in the background,
  /// or this runtime has already been invalidated.
  @objc(acquire:)
  public func acquire(_ token: String) -> NSNumber {
    gate.xmaxWithLock {
      guard !invalidated, owner == nil, foreground else {
        return false
      }

      owner = token
      active = true

      return true
    }
  }

  /// Reports whether this token still owns an engine that has not been released by backgrounding.
  @objc(isActive:)
  public func isActive(_ token: String) -> NSNumber {
    gate.xmaxWithLock {
      NSNumber(value: owner == token && active)
    }
  }

  /// Releases only the matching lease after the caller has destroyed its RTC engine.
  /// Repeated calls and stale tokens leave a newer owner's resources untouched.
  @objc(release:)
  public func release(_ token: String) {
    gate.xmaxWithLock {
      guard owner == token else {
        return
      }

      imageVideo.stop()

      // Normal JS close already destroyed the engine; background may have done so earlier.
      active = false
      owner = nil
    }
  }

  // MARK: - Runtime metadata

  /// Creates identifiers for media owners and operations without a main-thread hop.
  @objc
  public func randomUUID() -> String {
    UUID().uuidString
  }

  /// Returns the platform, OS version, and device model as the existing JS JSON payload.
  @objc
  public func runtimeInfo() -> String {
    metadata
  }

  // MARK: - Camera permissions

  /// Requests camera permission, then microphone permission only when requested.
  /// Resolves with granted, camera, or microphone to identify the first denied permission.
  /// The image pipeline does not call this method.
  @objc(requestPermissions:resolve:reject:)
  public func requestPermissions(
    _ useMicrophone: Bool,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    let promise = XmaxNativePromise(resolve: resolve, reject: reject)

    let cameraDone: @Sendable (Bool) -> Void = { granted in
      guard granted else {
        promise.resolve("camera")
        return
      }

      guard useMicrophone else {
        promise.resolve("granted")
        return
      }

      let status = AVCaptureDevice.authorizationStatus(for: .audio)

      if status == .notDetermined {
        AVCaptureDevice.requestAccess(for: .audio) { allowed in
          promise.resolve(allowed ? "granted" : "microphone")
        }
      } else {
        promise.resolve(status == .authorized ? "granted" : "microphone")
      }
    }

    let status = AVCaptureDevice.authorizationStatus(for: .video)

    if status == .notDetermined {
      AVCaptureDevice.requestAccess(for: .video, completionHandler: cameraDone)
    } else {
      cameraDone(status == .authorized)
    }
  }

  // MARK: - Prepared images

  /// Reads orientation-corrected dimensions from a local image without sending pixels to JS.
  @objc(imageInfo:resolve:reject:)
  public func imageInfo(
    _ fileURL: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    images.info(fileURL, promise: XmaxNativePromise(resolve: resolve, reject: reject))
  }

  /// Normalizes orientation and prepares a centered JPEG crop at the requested dimensions.
  /// The returned file belongs to the runtime and is removed during explicit cleanup or invalidation.
  @objc(prepareImage:width:height:resolve:reject:)
  public func prepareImage(
    _ fileURL: String,
    width: Double,
    height: Double,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    images.prepare(
      fileURL,
      width: width,
      height: height,
      promise: XmaxNativePromise(resolve: resolve, reject: reject)
    )
  }

  /// Deletes a prepared SDK cache image; the user's original file is never removed.
  /// Repeated removal of an already missing prepared image succeeds.
  @objc(removePreparedImage:resolve:reject:)
  public func removePreparedImage(
    _ fileURL: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    images.remove(fileURL, promise: XmaxNativePromise(resolve: resolve, reject: reject))
  }

  // MARK: - Image frame delivery

  /// Starts repeated native image frames using the RN adapter's already-created RTC singleton.
  /// Invalid formats, unavailable engines, and image decoding failures reject the operation.
  /// Nonzero pushExternalVideoFrame results do not reject startup or stop subsequent frames.
  @objc(startImageVideo:path:width:height:fps:resolve:reject:)
  public func startImageVideo(
    _ token: String,
    path: String,
    width: Double,
    height: Double,
    fps: Double,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    let promise = XmaxNativePromise(resolve: resolve, reject: reject)

    gate.xmaxWithLock {
      guard isActive(token).boolValue else {
        promise.reject("Media engine is not active", code: "CANCELLED")
        return
      }

      guard [width, height, fps].allSatisfy({ $0.isFinite && $0 > 0 && $0.rounded(.down) == $0 }),
        width * height <= 1_280_000, fps <= 60
      else {
        promise.reject("Invalid image video format")
        return
      }

      // The pinned SDK returns the existing singleton for subsequent create calls.
      guard let engine = ByteRTCVideo.createRTCVideo("", delegate: nil, parameters: [:]) else {
        promise.reject("RTC engine is unavailable")
        return
      }

      imageVideo.start(
        engine: engine,
        path: path,
        width: Int(width),
        height: Int(height),
        fps: Int(fps),
        active: { [weak self] in self?.isActive(token).boolValue == true },
        promise: promise
      )
    }
  }

  /// Cancels frame delivery and pending image decoding only for the matching owner.
  /// Must run before the caller destroys the RTC engine; repeated calls are safe.
  @objc(stopImageVideo:)
  public func stopImageVideo(_ token: String) {
    gate.xmaxWithLock {
      if owner == token {
        imageVideo.stop()
      }
    }
  }
}
