package ai.xmax.reactnative

import org.junit.Assert.assertEquals
import org.junit.Test

class XmaxCameraFrameLayoutTest {
  @Test fun portraitInputKeepsAllPixels() {
    assertEquals(XmaxCameraFrameLayout(0, 0, 1024, 1920), XmaxCameraFrameLayout.crop(1024, 1920, 1024, 1920))
  }

  @Test fun rotatedLandscapeInputCropsSidesWithoutStretching() {
    assertEquals(XmaxCameraFrameLayout(686, 0, 546, 1024), XmaxCameraFrameLayout.crop(1920, 1024, 1024, 1920))
  }

  @Test fun landscapeOutputCropsTopAndBottom() {
    assertEquals(XmaxCameraFrameLayout(0, 686, 1024, 546), XmaxCameraFrameLayout.crop(1024, 1920, 1920, 1024))
  }

  @Test fun squareOutputUsesCenteredEvenCoordinates() {
    assertEquals(XmaxCameraFrameLayout(448, 0, 1024, 1024), XmaxCameraFrameLayout.crop(1920, 1024, 832, 832))
  }
}
