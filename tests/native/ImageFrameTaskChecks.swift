import Foundation

@main
enum ImageFrameTaskChecks {
  static func main() {
    var task = XmaxImageFrameTask()
    func text(_ data: Data?) -> String? { data.flatMap { String(data: $0, encoding: .utf8) } }
    precondition(task.nextData() == nil)
    task.set("task-first?os=rn-ios")
    precondition(text(task.nextData()) == "task-first?os=rn-ios&index=0")
    task.set("task-first?os=rn-ios")
    precondition(text(task.nextData()) == "task-first?os=rn-ios&index=1")
    task.set("task-second?os=rn-ios")
    precondition(text(task.nextData()) == "task-second?os=rn-ios&index=0")
    task.set("")
    precondition(task.nextData() == nil)
    task.set("task-second?os=rn-ios")
    precondition(text(task.nextData()) == "task-second?os=rn-ios&index=0")
    for index in 1...1000 {
      precondition(text(task.nextData()) == "task-second?os=rn-ios&index=\(index)")
    }
    print("Image frame task checks passed")
  }
}
