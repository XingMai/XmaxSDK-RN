package ai.xmax.reactnative

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class XmaxImageFrameTaskTest {
  @Test fun taskLifetimeControlsFrameIdentityAndSequence() {
    val task = XmaxImageFrameTask()
    assertNull(task.nextData())
    task.set("task-first?os=rn-android")
    assertEquals("task-first?os=rn-android&index=0", task.nextData()!!.toString(Charsets.UTF_8))
    task.set("task-first?os=rn-android")
    assertEquals("task-first?os=rn-android&index=1", task.nextData()!!.toString(Charsets.UTF_8))
    task.set("task-second?os=rn-android")
    assertEquals("task-second?os=rn-android&index=0", task.nextData()!!.toString(Charsets.UTF_8))
    task.set("")
    assertNull(task.nextData())
    task.set("task-second?os=rn-android")
    for (index in 0..1000) {
      assertEquals("task-second?os=rn-android&index=$index", task.nextData()!!.toString(Charsets.UTF_8))
    }
  }
}
