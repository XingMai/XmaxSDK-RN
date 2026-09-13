@main
enum ImageVideoFormatChecks {
  static func main() {
    for (width, height) in [(1024.0, 1920.0), (1920.0, 1024.0), (832.0, 1472.0), (2048.0, 2048.0)] {
      precondition(XmaxImageVideoFormat.isValid(width: width, height: height, fps: 30))
    }
    for invalid in [0.0, -1.0, 1024.5, .nan, .infinity, 2147483648.0] {
      precondition(!XmaxImageVideoFormat.isValid(width: invalid, height: 1920, fps: 30))
      precondition(!XmaxImageVideoFormat.isValid(width: 1024, height: invalid, fps: 30))
    }
    for fps in [0.0, -1.0, 30.5, 61.0, .nan, .infinity] {
      precondition(!XmaxImageVideoFormat.isValid(width: 1024, height: 1920, fps: fps))
    }
    precondition(XmaxImageVideoFormat.isValid(width: 1024, height: 1920, fps: 60))
    print("Native image video format checks passed")
  }
}
