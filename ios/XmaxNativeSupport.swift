import Foundation
@preconcurrency import React

/// Serializes native ownership and frame delivery without requiring the JS thread.
extension NSRecursiveLock {
  /// Releases the lock even when the operation throws; nested ownership checks are allowed.
  func xmaxWithLock<T>(_ operation: () throws -> T) rethrows -> T {
    lock()
    defer {
      unlock()
    }

    return try operation()
  }
}

/// Carries RN's thread-safe promise callbacks across native worker queues.
final class XmaxNativePromise: @unchecked Sendable {
  private let resolveBlock: RCTPromiseResolveBlock
  private let rejectBlock: RCTPromiseRejectBlock

  /// Retains the bridge callbacks for an asynchronous native operation.
  init(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    resolveBlock = resolve
    rejectBlock = reject
  }

  /// Completes the operation using its existing JS result shape.
  func resolve(_ value: Any? = nil) {
    resolveBlock(value)
  }

  /// Preserves the JS error code and includes the underlying native error when available.
  func reject(_ message: String, code: String = "MEDIA_ERROR", error: Error? = nil) {
    rejectBlock(code, message, error)
  }
}

/// An actionable native media failure, forwarded through the existing JS error contract.
struct XmaxNativeFailure: LocalizedError {
  let message: String

  var errorDescription: String? {
    message
  }
}
