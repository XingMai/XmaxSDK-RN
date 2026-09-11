#import "XmaxRuntime.h"
#import "XmaxReactNativeSDK-Swift.h"
#import <React/RCTInvalidating.h>

/** Adapts RN Codegen methods to the Swift native runtime implementation. */
@interface XmaxRuntime () <RCTInvalidating>
@property(nonatomic, strong) XmaxRuntimeImplementation *implementation;
@end

@implementation XmaxRuntime
RCT_EXPORT_MODULE(XmaxRuntime)

+ (BOOL)requiresMainQueueSetup {
  return NO;
}

- (dispatch_queue_t)methodQueue {
  return dispatch_get_main_queue();
}

- (instancetype)init {
  if ((self = [super init])) {
    self.implementation = [XmaxRuntimeImplementation new];
  }

  return self;
}

- (void)invalidate {
  [self.implementation invalidate];
}

- (void)prepareRuntime:(RCTPromiseResolveBlock)resolve
                reject:(RCTPromiseRejectBlock)reject {
  [self.implementation prepareRuntime:resolve reject:reject];
}

- (NSNumber *)acquire:(NSString *)owner {
  return [self.implementation acquire:owner];
}

- (NSNumber *)isActive:(NSString *)owner {
  return [self.implementation isActive:owner];
}

- (void)release:(NSString *)owner {
  [self.implementation release:owner];
}

- (NSString *)randomUUID {
  return [self.implementation randomUUID];
}

- (NSString *)runtimeInfo {
  return [self.implementation runtimeInfo];
}

- (void)configureLogging:(double)options {
  [self.implementation configureLogging:options];
}

- (void)writeLog:(NSString *)level message:(NSString *)message option:(double)option {
  [self.implementation writeLog:level message:message option:option];
}

- (void)requestPermissions:(BOOL)useMicrophone
                   resolve:(RCTPromiseResolveBlock)resolve
                    reject:(RCTPromiseRejectBlock)reject {
  [self.implementation requestPermissions:useMicrophone resolve:resolve reject:reject];
}

- (void)imageInfo:(NSString *)fileURL
          resolve:(RCTPromiseResolveBlock)resolve
           reject:(RCTPromiseRejectBlock)reject {
  [self.implementation imageInfo:fileURL resolve:resolve reject:reject];
}

- (void)prepareImage:(NSString *)fileURL
               width:(double)width
              height:(double)height
             resolve:(RCTPromiseResolveBlock)resolve
              reject:(RCTPromiseRejectBlock)reject {
  [self.implementation prepareImage:fileURL width:width height:height resolve:resolve reject:reject];
}

- (void)removePreparedImage:(NSString *)fileURL
                    resolve:(RCTPromiseResolveBlock)resolve
                     reject:(RCTPromiseRejectBlock)reject {
  [self.implementation removePreparedImage:fileURL resolve:resolve reject:reject];
}

- (void)startImageVideo:(NSString *)owner
                   path:(NSString *)path
                  width:(double)width
                 height:(double)height
                    fps:(double)fps
                resolve:(RCTPromiseResolveBlock)resolve
                 reject:(RCTPromiseRejectBlock)reject {
  [self.implementation startImageVideo:owner
                                 path:path
                                width:width
                               height:height
                                  fps:fps
                              resolve:resolve
                               reject:reject];
}

- (void)stopImageVideo:(NSString *)owner {
  [self.implementation stopImageVideo:owner];
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<facebook::react::NativeXmaxRuntimeSpecJSI>(params);
}

@end
