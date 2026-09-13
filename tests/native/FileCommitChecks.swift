import Foundation

/// Runs the production Apple file commit implementation against real temporary files.
@main
struct FileCommitChecks {
  static func main() throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: directory) }
    let source = directory.appendingPathComponent("new.partial")
    let target = directory.appendingPathComponent("image.jpg")
    try "old".write(to: target, atomically: false, encoding: .utf8)
    do {
      try XmaxFileCommit.replace(source.path, destinationPath: target.path)
      fatalError("Missing source must reject")
    } catch {}
    let old = try String(contentsOf: target, encoding: .utf8)
    precondition(old == "old")
    try "new".write(to: source, atomically: false, encoding: .utf8)
    try XmaxFileCommit.replace(source.path, destinationPath: target.path)
    let updated = try String(contentsOf: target, encoding: .utf8)
    precondition(updated == "new" && !FileManager.default.fileExists(atPath: source.path))
    try "second".write(to: source, atomically: false, encoding: .utf8)
    let second = directory.appendingPathComponent("second.jpg")
    try XmaxFileCommit.replace(source.path, destinationPath: second.path)
    let created = try String(contentsOf: second, encoding: .utf8)
    precondition(created == "second")
    try "keep".write(to: source, atomically: false, encoding: .utf8)
    do {
      try XmaxFileCommit.replace(source.path, destinationPath: directory.path)
      fatalError("Directory destination must reject")
    } catch {}
    let retained = try String(contentsOf: source, encoding: .utf8)
    precondition(retained == "keep")
    print("Apple atomic file commit checks passed")
  }
}
