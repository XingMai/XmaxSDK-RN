#import "XmaxImageManager.h"
#import <ImageIO/ImageIO.h>
#import <UIKit/UIKit.h>

static NSURL *XmaxLocalImageURL(NSString *value) {
  NSURL *url = [value hasPrefix:@"/"] ? [NSURL fileURLWithPath:value] : [NSURL URLWithString:value];
  return url.isFileURL ? url : nil;
}

static NSURL *XmaxImageDirectory(void) {
  return [[[NSFileManager defaultManager] URLsForDirectory:NSCachesDirectory inDomains:NSUserDomainMask].firstObject URLByAppendingPathComponent:@"xmax-images" isDirectory:YES];
}

static CGImageSourceRef XmaxImageSource(NSString *value) {
  NSURL *url = XmaxLocalImageURL(value);
  return url ? CGImageSourceCreateWithURL((__bridge CFURLRef)url, (__bridge CFDictionaryRef)@{(__bridge NSString *)kCGImageSourceShouldCache: @NO}) : nil;
}

@interface XmaxImageManager ()
@property(nonatomic) NSMutableSet<NSURL *> *owned;
@property(nonatomic) BOOL invalidated;
@end

@implementation XmaxImageManager

- (instancetype)init {
  if ((self = [super init])) self.owned = [NSMutableSet set];
  return self;
}

- (void)info:(NSString *)fileURL resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    @autoreleasepool {
      CGImageSourceRef source = XmaxImageSource(fileURL);
      NSDictionary *properties = source ? CFBridgingRelease(CGImageSourceCopyPropertiesAtIndex(source, 0, nil)) : nil;
      if (source) CFRelease(source);
      NSInteger width = [properties[(__bridge NSString *)kCGImagePropertyPixelWidth] integerValue];
      NSInteger height = [properties[(__bridge NSString *)kCGImagePropertyPixelHeight] integerValue];
      NSInteger orientation = [properties[(__bridge NSString *)kCGImagePropertyOrientation] integerValue];
      if (width <= 0 || height <= 0) {
        reject(@"MEDIA_ERROR", @"Unable to read local image dimensions", nil);
        return;
      }
      BOOL rotated = orientation >= 5 && orientation <= 8;
      NSDictionary *size = @{ @"width": @(rotated ? height : width), @"height": @(rotated ? width : height) };
      NSData *json = [NSJSONSerialization dataWithJSONObject:size options:0 error:nil];
      resolve([[NSString alloc] initWithData:json encoding:NSUTF8StringEncoding]);
    }
  });
}

- (void)prepare:(NSString *)fileURL width:(double)width height:(double)height resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    @autoreleasepool {
      if (!isfinite(width) || !isfinite(height) || width <= 0 || height <= 0 || floor(width) != width || floor(height) != height || width * height > 1280000) {
        reject(@"MEDIA_ERROR", @"Invalid prepared image dimensions", nil);
        return;
      }
      CGImageSourceRef source = XmaxImageSource(fileURL);
      if (!source) {
        reject(@"MEDIA_ERROR", @"Unable to open local image", nil);
        return;
      }
      // ImageIO applies all EXIF rotations/reflections before the centered crop.
      NSDictionary *options = @{
        (__bridge NSString *)kCGImageSourceCreateThumbnailFromImageAlways: @YES,
        (__bridge NSString *)kCGImageSourceCreateThumbnailWithTransform: @YES,
        (__bridge NSString *)kCGImageSourceShouldCacheImmediately: @YES,
        (__bridge NSString *)kCGImageSourceThumbnailMaxPixelSize: @4096,
      };
      CGImageRef decoded = CGImageSourceCreateThumbnailAtIndex(source, 0, (__bridge CFDictionaryRef)options);
      CFRelease(source);
      if (!decoded) {
        reject(@"MEDIA_ERROR", @"Unable to decode local image", nil);
        return;
      }
      UIImage *image = [UIImage imageWithCGImage:decoded];
      CGImageRelease(decoded);
      CGFloat scale = MAX(width / image.size.width, height / image.size.height);
      CGRect target = CGRectMake((width - image.size.width * scale) / 2, (height - image.size.height * scale) / 2, image.size.width * scale, image.size.height * scale);
      UIGraphicsImageRendererFormat *format = [UIGraphicsImageRendererFormat defaultFormat];
      format.scale = 1;
      format.opaque = YES;
      UIGraphicsImageRenderer *renderer = [[UIGraphicsImageRenderer alloc] initWithSize:CGSizeMake(width, height) format:format];
      NSData *data = [renderer JPEGDataWithCompressionQuality:0.95 actions:^(UIGraphicsImageRendererContext *context) {
        [UIColor.blackColor setFill];
        [context fillRect:CGRectMake(0, 0, width, height)];
        [image drawInRect:target];
      }];
      NSError *error = nil;
      NSURL *directory = XmaxImageDirectory();
      NSURL *output = [directory URLByAppendingPathComponent:[NSUUID.UUID.UUIDString stringByAppendingString:@".jpg"]];
      if (!data || ![[NSFileManager defaultManager] createDirectoryAtURL:directory withIntermediateDirectories:YES attributes:nil error:&error] || ![data writeToURL:output options:NSDataWritingAtomic error:&error]) {
        [[NSFileManager defaultManager] removeItemAtURL:output error:nil];
        reject(@"MEDIA_ERROR", @"Unable to save prepared image", error);
        return;
      }
      @synchronized(self) {
        if (self.invalidated) {
          [[NSFileManager defaultManager] removeItemAtURL:output error:nil];
          reject(@"MEDIA_ERROR", @"Image runtime has been released", nil);
          return;
        }
        [self.owned addObject:output];
      }
      resolve(output.absoluteString);
    }
  });
}

- (void)remove:(NSString *)fileURL resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{
    NSURL *url = XmaxLocalImageURL(fileURL).URLByResolvingSymlinksInPath;
    NSURL *directory = XmaxImageDirectory().URLByResolvingSymlinksInPath;
    if (!url || ![url.URLByDeletingLastPathComponent.path isEqualToString:directory.path] || ![url.pathExtension isEqualToString:@"jpg"]) {
      reject(@"MEDIA_ERROR", @"Refusing to remove an image outside SDK cache", nil);
      return;
    }
    NSError *error = nil;
    if (![[NSFileManager defaultManager] removeItemAtURL:url error:&error] && error.code != NSFileNoSuchFileError) {
      reject(@"MEDIA_ERROR", @"Unable to remove prepared image", error);
      return;
    }
    @synchronized(self) { [self.owned removeObject:[NSURL URLWithString:fileURL]]; }
    resolve(nil);
  });
}

/** Engine destruction precedes this cleanup; late preparation deletes its result. */
- (void)invalidate {
  @synchronized(self) {
    self.invalidated = YES;
    for (NSURL *url in self.owned) [[NSFileManager defaultManager] removeItemAtURL:url error:nil];
    [self.owned removeAllObjects];
  }
}

@end
