#import <React/RCTBridgeModule.h>
#import <MapKit/MapKit.h>

@interface WhiskerPlaceSearch : NSObject <RCTBridgeModule>
@end

@implementation WhiskerPlaceSearch
RCT_EXPORT_MODULE();
+ (BOOL)requiresMainQueueSetup { return YES; }
- (dispatch_queue_t)methodQueue { return dispatch_get_main_queue(); }
RCT_EXPORT_METHOD(search:(NSString *)query resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
{
  NSString *text = [query stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
  if (text.length < 2 || text.length > 150) { resolve(@[]); return; }
  MKLocalSearchRequest *request = [MKLocalSearchRequest new];
  request.naturalLanguageQuery = [text stringByAppendingString:@" Singapore"];
  request.region = MKCoordinateRegionMake(CLLocationCoordinate2DMake(1.3521, 103.8198), MKCoordinateSpanMake(0.45, 0.65));
  MKLocalSearch *search = [[MKLocalSearch alloc] initWithRequest:request];
  __block BOOL settled = NO;
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 15 * NSEC_PER_SEC), dispatch_get_main_queue(), ^{
    if (settled) return;
    settled = YES;
    [search cancel];
    reject(@"search_timeout", @"Place search timed out", nil);
  });
  [search startWithCompletionHandler:^(MKLocalSearchResponse *response, NSError *error) {
    dispatch_async(dispatch_get_main_queue(), ^{
      if (settled) return;
      settled = YES;
      if (error) { reject(@"search_failed", @"Place search unavailable", error); return; }
      NSMutableArray *items = [NSMutableArray new];
      for (MKMapItem *item in response.mapItems) {
        MKPlacemark *p = item.placemark;
        CLLocationCoordinate2D c = p.coordinate;
        if (![p.ISOcountryCode isEqualToString:@"SG"] || c.latitude < 1.15 || c.latitude > 1.5 || c.longitude < 103.55 || c.longitude > 104.15) continue;
        [items addObject:@{ @"id": [NSString stringWithFormat:@"%.6f,%.6f:%@", c.latitude, c.longitude, item.name ?: @""],
          @"name": item.name ?: text, @"address": p.title ?: @"", @"postalCode": p.postalCode ?: @"",
          @"latitude": @(c.latitude), @"longitude": @(c.longitude) }];
        if (items.count >= 20) break;
      }
      resolve(items);
    });
  }];
}
@end
