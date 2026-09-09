#import "XmaxRuntime.h"
#import <AVFoundation/AVFoundation.h>
#import <UIKit/UIKit.h>
#import <VolcEngineRTC/VolcEngineRTC.h>
#import <React/RCTInvalidating.h>
#import <sys/utsname.h>

@interface XmaxRuntime () <RCTInvalidating>
@property(nonatomic, copy) NSString *owner;
@property(nonatomic) BOOL active;
@property(nonatomic) BOOL foreground;
@end

@implementation XmaxRuntime
RCT_EXPORT_MODULE(XmaxRuntime)
+ (BOOL)requiresMainQueueSetup { return YES; }
- (dispatch_queue_t)methodQueue { return dispatch_get_main_queue(); }
- (instancetype)init {
  if ((self = [super init])) {
    self.foreground = UIApplication.sharedApplication.applicationState != UIApplicationStateBackground;
    [[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(background:) name:UIApplicationDidEnterBackgroundNotification object:nil];
    [[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(foreground:) name:UIApplicationWillEnterForegroundNotification object:nil];
  }
  return self;
}
- (void)background:(NSNotification *)notification {
  @synchronized(self) {
    self.foreground = NO;
    if (self.owner && self.active) {
      self.active = NO;
      [ByteRTCVideo destroyRTCVideo];
    }
  }
}
- (void)foreground:(NSNotification *)notification {
  @synchronized(self) { self.foreground = YES; }
}
- (void)invalidate {
  [[NSNotificationCenter defaultCenter] removeObserver:self];
  @synchronized(self) {
    if (self.owner && self.active) [ByteRTCVideo destroyRTCVideo];
    self.active = NO;
    self.owner = nil;
  }
}
- (NSNumber *)acquire:(NSString *)owner {
  @synchronized(self) {
    if (self.owner || !self.foreground) return @NO;
    self.owner = owner;
    self.active = YES;
    return @YES;
  }
}
- (NSNumber *)isActive:(NSString *)owner {
  @synchronized(self) { return @([self.owner isEqualToString:owner] && self.active); }
}
- (void)release:(NSString *)owner {
  @synchronized(self) {
    if (![self.owner isEqualToString:owner]) return;
    // Normal close destroys the vendor engine first; background already destroyed it.
    self.active = NO;
    self.owner = nil;
  }
}
- (NSString *)randomUUID { return NSUUID.UUID.UUIDString; }
- (NSString *)runtimeInfo {
  struct utsname info; uname(&info);
  NSDictionary *value = @{ @"platform": @"ios", @"os_version": UIDevice.currentDevice.systemVersion, @"device_model": @(info.machine) };
  return [[NSString alloc] initWithData:[NSJSONSerialization dataWithJSONObject:value options:0 error:nil] encoding:NSUTF8StringEncoding];
}
- (void)requestPermissions:(BOOL)useMicrophone resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  void (^cameraDone)(BOOL) = ^(BOOL granted) {
    if (!granted) { resolve(@"camera"); return; }
    if (!useMicrophone) { resolve(@"granted"); return; }
    AVAuthorizationStatus status = [AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeAudio];
    if (status == AVAuthorizationStatusNotDetermined) {
      [AVCaptureDevice requestAccessForMediaType:AVMediaTypeAudio completionHandler:^(BOOL allowed) { resolve(allowed ? @"granted" : @"microphone"); }];
    } else resolve(status == AVAuthorizationStatusAuthorized ? @"granted" : @"microphone");
  };
  AVAuthorizationStatus status = [AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeVideo];
  if (status == AVAuthorizationStatusNotDetermined) [AVCaptureDevice requestAccessForMediaType:AVMediaTypeVideo completionHandler:cameraDone];
  else cameraDone(status == AVAuthorizationStatusAuthorized);
}
- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:(const facebook::react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<facebook::react::NativeXmaxRuntimeSpecJSI>(params);
}
@end
