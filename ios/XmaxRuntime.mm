#import "XmaxRuntime.h"
#import "XmaxReactNativeSDK-Swift.h"
#import <React/RCTInvalidating.h>
#import <React/RCTViewComponentView.h>

/** Adapts RN Codegen methods to the Swift native runtime implementation. */
@interface XmaxRuntime () <RCTInvalidating>
@property(nonatomic, strong) XmaxRuntimeImplementation *implementation;
@end

@implementation XmaxRuntime
RCT_EXPORT_MODULE(XmaxRuntime)
@synthesize viewRegistry_DEPRECATED = _viewRegistry_DEPRECATED;

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

// iOS already serializes stream indices numerically; only Android installs an adapter.
- (NSNumber *)adaptRtcVideoEvents:(NSString *)owner {
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

// Registry lookup stays in the RN adapter; Swift owns the actual view mutation.
- (void)hideVideoContainer:(double)reactTag
                 nativeID:(NSString *)nativeID
                  resolve:(RCTPromiseResolveBlock)resolve
                   reject:(RCTPromiseRejectBlock)reject {
  __weak RCTViewRegistry *registry = self.viewRegistry_DEPRECATED;
  dispatch_async(dispatch_get_main_queue(), ^{
    UIView *view = [registry viewForReactTag:@(reactTag)];
    // Fabric stores nativeID as nativeId. Verify it before touching a recycled tag.
    if ([view isKindOfClass:[RCTViewComponentView class]] &&
        [((RCTViewComponentView *)view).nativeId isEqualToString:nativeID]) {
      [self.implementation hideVideoContainer:view];
    }
    resolve(nil);
  });
}

- (void)renderTrajectory:(double)reactTag nativeID:(NSString *)nativeID command:(NSString *)command {
  __weak RCTViewRegistry *registry = self.viewRegistry_DEPRECATED;
  dispatch_async(dispatch_get_main_queue(), ^{
    UIView *view = [registry viewForReactTag:@(reactTag)];
    if ([view isKindOfClass:[RCTViewComponentView class]] &&
        [((RCTViewComponentView *)view).nativeId isEqualToString:nativeID]) {
      [XmaxTrajectoryView renderIn:view command:command];
    }
  });
}

- (void)requestPermissions:(BOOL)useMicrophone
                   resolve:(RCTPromiseResolveBlock)resolve
                    reject:(RCTPromiseRejectBlock)reject {
  [self.implementation requestPermissions:useMicrophone resolve:resolve reject:reject];
}

- (void)replaceFile:(NSString *)sourcePath
    destinationPath:(NSString *)destinationPath
            resolve:(RCTPromiseResolveBlock)resolve
             reject:(RCTPromiseRejectBlock)reject {
  [self.implementation replaceFile:sourcePath destinationPath:destinationPath resolve:resolve reject:reject];
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

- (NSNumber *)setImageVideoTask:(NSString *)owner taskID:(NSString *)taskID {
  return [self.implementation setImageVideoTask:owner taskID:taskID];
}

- (void)stopImageVideo:(NSString *)owner {
  [self.implementation stopImageVideo:owner];
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<facebook::react::NativeXmaxRuntimeSpecJSI>(params);
}

@end
