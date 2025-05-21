// File: ShareHandler.m - Place this in your iOS project folder
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(ShareHandler, RCTEventEmitter)
RCT_EXTERN_METHOD(checkPendingShares)
@end