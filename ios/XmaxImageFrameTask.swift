import Foundation

/// Image frame metadata, accessed only under the source's shared runtime gate.
struct XmaxImageFrameTask {
  private var taskID = ""
  private var index: UInt64 = 0

  /// Replaces the task and resets its sequence; repeated assignments are idempotent.
  mutating func set(_ taskID: String) {
    guard self.taskID != taskID else { return }
    self.taskID = taskID
    index = 0
  }

  /// Returns no metadata outside generation, so the source skips that frame.
  mutating func nextData() -> Data? {
    guard !taskID.isEmpty else { return nil }
    let data = Data("\(taskID)&index=\(index)".utf8)
    index &+= 1
    return data
  }
}
