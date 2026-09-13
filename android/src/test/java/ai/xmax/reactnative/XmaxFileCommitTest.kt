package ai.xmax.reactnative

import java.nio.file.Files
import org.junit.Assert.*
import org.junit.Test

class XmaxFileCommitTest {
  @Test fun replacesExistingFileAndCreatesNewDestination() {
    val directory = Files.createTempDirectory("xmax-commit").toFile()
    try {
      val source = directory.resolve("new.partial")
      val target = directory.resolve("image.jpg")
      target.writeText("old")
      source.writeText("new")
      XmaxFileCommit.replace(source.path, target.path)
      assertEquals("new", target.readText())
      assertFalse(source.exists())
      val second = directory.resolve("second.jpg")
      source.writeText("second")
      XmaxFileCommit.replace(source.path, second.path)
      assertEquals("second", second.readText())
    } finally { directory.deleteRecursively() }
  }

  @Test fun failedCommitPreservesExistingFiles() {
    val directory = Files.createTempDirectory("xmax-commit").toFile()
    try {
      val source = directory.resolve("new.partial")
      val target = directory.resolve("image.jpg")
      target.writeText("old")
      assertThrows(Exception::class.java) { XmaxFileCommit.replace(source.path, target.path) }
      assertEquals("old", target.readText())
      source.writeText("new")
      val other = directory.resolve("nested").apply { mkdir() }.resolve("image.jpg")
      other.writeText("keep")
      assertThrows(Exception::class.java) { XmaxFileCommit.replace(source.path, other.path) }
      assertEquals("keep", other.readText())
      assertEquals("new", source.readText())
      assertThrows(Exception::class.java) { XmaxFileCommit.replace(source.path, directory.path) }
      assertEquals("old", target.readText())
      assertEquals("new", source.readText())
    } finally { directory.deleteRecursively() }
  }
}
