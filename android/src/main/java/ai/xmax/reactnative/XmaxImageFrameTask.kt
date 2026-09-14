package ai.xmax.reactnative

/** Image frame metadata, accessed only under the source's shared runtime gate. */
internal class XmaxImageFrameTask {
  private var taskID = ""
  private var index = 0uL

  /** Repeated assignments preserve the sequence; replacing or clearing resets it. */
  fun set(taskID: String) {
    if (this.taskID == taskID) return
    this.taskID = taskID
    index = 0uL
  }

  /** No frame is submitted outside an active generation task. */
  fun nextData(): ByteArray? {
    if (taskID.isEmpty()) return null
    return "$taskID&index=${index++}".toByteArray(Charsets.UTF_8)
  }
}
