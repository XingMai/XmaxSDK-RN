import Darwin
import Foundation

/// Commits completed downloads without first removing an existing destination.
enum XmaxFileCommit {
  static let queue = DispatchQueue(label: "ai.xmax.storage.commit", qos: .utility)

  /// Same-directory rename is atomic; failure leaves the previous file in place.
  static func replace(_ sourcePath: String, destinationPath: String) throws {
    guard sourcePath.hasPrefix("/"), destinationPath.hasPrefix("/"),
      !sourcePath.contains("\0"), !destinationPath.contains("\0")
    else {
      throw CocoaError(.fileWriteInvalidFileName)
    }

    let source = URL(fileURLWithPath: sourcePath).standardizedFileURL
    let destination = URL(fileURLWithPath: destinationPath).standardizedFileURL
    guard source != destination,
      source.deletingLastPathComponent() == destination.deletingLastPathComponent(),
      try source.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile == true
    else {
      throw CocoaError(.fileWriteInvalidFileName)
    }

    let result = source.path.withCString { sourcePointer in
      destination.path.withCString { destinationPointer in
        Darwin.rename(sourcePointer, destinationPointer)
      }
    }
    if result != 0 {
      throw NSError(domain: NSPOSIXErrorDomain, code: Int(errno))
    }
  }
}
