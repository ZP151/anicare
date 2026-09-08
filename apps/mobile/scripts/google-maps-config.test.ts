import { getAndroidGoogleMapsBuildConfig } from '../app.config';

describe('Google Maps native build configuration', () => {
  it('configures Google only for Android when the Android key is present', () => {
    expect(getAndroidGoogleMapsBuildConfig({
      GOOGLE_MAPS_ANDROID_API_KEY: 'android-secret',
    })).toEqual({
      configured: true,
      plugin: ['react-native-maps', {
        androidGoogleMapsApiKey: 'android-secret',
      }],
    });
  });

  it('does not enable Android without its own key', () => {
    expect(getAndroidGoogleMapsBuildConfig({})).toEqual({
      configured: false,
      plugin: 'react-native-maps',
    });
  });
});
