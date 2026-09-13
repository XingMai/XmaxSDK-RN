package ai.xmax.reactnative

import java.nio.file.Files
import java.nio.file.LinkOption
import java.nio.file.Paths
import java.nio.file.StandardCopyOption

/** Commits completed downloads without first removing an existing destination. */
internal object XmaxFileCommit {
  /** Same-directory atomic rename preserves the previous file if committing fails. */
  fun replace(sourcePath: String, destinationPath: String) {
    val source = Paths.get(sourcePath).normalize()
    val destination = Paths.get(destinationPath).normalize()
    require(source.isAbsolute && destination.isAbsolute && source != destination &&
      source.parent == destination.parent && Files.isRegularFile(source, LinkOption.NOFOLLOW_LINKS)) {
      "Expected a completed file beside its destination"
    }
    Files.move(source, destination, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING)
  }
}
