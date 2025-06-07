#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(URLSessionNetworkAdapter, RCTEventEmitter)

RCT_EXTERN_METHOD(request:(NSDictionary *)config
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(cancelRequest:(NSString *)requestId)

RCT_EXTERN_METHOD(cancelAllRequests)

@end