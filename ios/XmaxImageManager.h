#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>

/** Native image decoding and private-cache ownership; no generation business logic. */
@interface XmaxImageManager : NSObject
- (void)info:(NSString *)fileURL resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject;
- (void)prepare:(NSString *)fileURL width:(double)width height:(double)height resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject;
- (void)remove:(NSString *)fileURL resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject;
- (void)invalidate;
@end
