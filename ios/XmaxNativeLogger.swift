import Foundation
import OSLog

/// Serializes the global log filter and routes JS/native diagnostics to Apple's unified log.
final class XmaxNativeLogger: @unchecked Sendable {
  private static let state = XmaxNativeLogger()
  private let gate = NSLock()
  private var options = 0
  private let logger = Logger(subsystem: "ai.xmax.XmaxSDK", category: "XmaxSDK")

  /// Replaces the filter; a new client affects every existing SDK service.
  static func configure(_ options: Double) {
    state.gate.lock()
    defer {
      state.gate.unlock()
    }

    state.options = options.isFinite && (0...3).contains(options) ? Int(options) : 0
  }

  /// Receives only preformatted safe metadata, never credentials or raw native exceptions.
  static func write(_ level: String, message: String, option: Int = 1) {
    state.gate.lock()
    defer {
      state.gate.unlock()
    }

    guard option > 0, state.options & option == option else {
      return
    }

    switch level {
    case "debug":
      state.logger.debug("\(message, privacy: .public)")
    case "info":
      state.logger.info("\(message, privacy: .public)")
    case "warn":
      state.logger.warning("\(message, privacy: .public)")
    case "error":
      state.logger.error("\(message, privacy: .public)")
    default:
      return
    }
  }
}
