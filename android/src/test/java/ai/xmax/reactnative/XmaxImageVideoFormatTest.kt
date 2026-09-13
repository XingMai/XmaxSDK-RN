package ai.xmax.reactnative

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class XmaxImageVideoFormatTest {
  @Test fun acceptsBothProBucketsWithoutRepeatingModelPixelLimits() {
    for ((width, height) in listOf(1024.0 to 1920.0, 1920.0 to 1024.0, 832.0 to 1472.0, 2048.0 to 2048.0)) {
      assertTrue(XmaxImageVideoFormat.isValid(width, height, 30.0))
    }
    assertTrue(XmaxImageVideoFormat.isValid(1024.0, 1920.0, 60.0))
  }

  @Test fun rejectsInvalidNativeDimensionsAndFrameRates() {
    for (invalid in listOf(0.0, -1.0, 1024.5, Double.NaN, Double.POSITIVE_INFINITY, 2147483648.0)) {
      assertFalse(XmaxImageVideoFormat.isValid(invalid, 1920.0, 30.0))
      assertFalse(XmaxImageVideoFormat.isValid(1024.0, invalid, 30.0))
    }
    for (fps in listOf(0.0, -1.0, 30.5, 61.0, Double.NaN, Double.POSITIVE_INFINITY)) {
      assertFalse(XmaxImageVideoFormat.isValid(1024.0, 1920.0, fps))
    }
  }
}
