#import <XmaxRuntimeSpec/XmaxRuntimeSpec.h>

/**
 * Exposes the Swift runtime through the generated React Native TurboModule API.
 * Native resource ownership and lifecycle behavior live in the Swift implementation.
 */
@interface XmaxRuntime : NSObject <NativeXmaxRuntimeSpec>
@end
