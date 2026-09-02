import { getGoogleMapsBuildConfig } from '../app.config';

describe('Google Maps native build configuration', () => {
  it('configures both native keys when both are present', () => {
    expect(getGoogleMapsBuildConfig({
      GOOGLE_MAPS_IOS_API_KEY: 'ios-secret',
      GOOGLE_MAPS_ANDROID_API_KEY: 'android-secret',
    })).toEqual({
      configured: true,
      plugin: ['react-native-maps', {
        iosGoogleMapsApiKey: 'ios-secret',
        androidGoogleMapsApiKey: 'android-secret',
      }],
    });
  });

  it('configures the iOS native key without requiring an Android key', () => {
    expect(getGoogleMapsBuildConfig({ GOOGLE_MAPS_IOS_API_KEY: 'ios-only' })).toEqual({
      configured: true,
      plugin: ['react-native-maps', {
        iosGoogleMapsApiKey: 'ios-only',
      }],
    });
  });

  it('fails closed when the iOS key is absent', () => {
    expect(getGoogleMapsBuildConfig({ GOOGLE_MAPS_ANDROID_API_KEY: 'android-only' })).toEqual({
      configured: false,
      plugin: 'react-native-maps',
    });
    expect(getGoogleMapsBuildConfig({})).toEqual({
      configured: false,
      plugin: 'react-native-maps',
    });
  });
});
