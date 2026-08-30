import { getGoogleMapsBuildConfig } from '../app.config';

describe('Google Maps native build configuration', () => {
  it('configures native keys only when both platform keys are present', () => {
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

  it('fails closed when either platform key is absent', () => {
    expect(getGoogleMapsBuildConfig({ GOOGLE_MAPS_IOS_API_KEY: 'ios-only' })).toEqual({
      configured: false,
      plugin: 'react-native-maps',
    });
    expect(getGoogleMapsBuildConfig({})).toEqual({
      configured: false,
      plugin: 'react-native-maps',
    });
  });
});
