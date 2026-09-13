/// Validates native frame dimensions without duplicating model resolution rules.
enum XmaxImageVideoFormat {
  /// Model buckets and pixel bounds have already been resolved by MediaService.
  /// Dimensions must fit the RTC frame's signed 32-bit fields.
  static func isValid(width: Double, height: Double, fps: Double) -> Bool {
    [width, height].allSatisfy {
      $0.isFinite && $0 > 0 && $0.rounded(.down) == $0 && $0 <= Double(Int32.max)
    } && fps.isFinite && fps > 0 && fps.rounded(.down) == fps && fps <= 60
  }
}
