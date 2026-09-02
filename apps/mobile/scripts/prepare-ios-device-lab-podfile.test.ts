import {
  prepareIosDeviceLabPodfile,
} from './prepare-ios-device-lab-podfile';

const generatedMapsLine = '  rn_maps_path = File.dirname(`node --print "require.resolve(\'react-native-maps/package.json\')"`) ';
const normalizedMapsLine = "  rn_maps_path = '../node_modules/react-native-maps'";
const podfile = `platform :ios, '15.1'
${generatedMapsLine}
  pod 'react-native-maps/Google', :path => rn_maps_path 
`;

const enabledProperties = JSON.stringify({
  'expo.sqlite.useSQLCipher': 'true',
});

describe('iOS Device Lab generated Podfile preparation', () => {
  it('requires the generated SQLCipher property and normalizes the exact Maps path line once', () => {
    expect(prepareIosDeviceLabPodfile({
      podfile,
      podfileProperties: enabledProperties,
    })).toBe(podfile.replace(generatedMapsLine, normalizedMapsLine));
  });

  it.each([
    ['a missing SQLCipher property', '{}'],
    ['a false SQLCipher property', JSON.stringify({ 'expo.sqlite.useSQLCipher': 'false' })],
    ['a non-string SQLCipher property', JSON.stringify({ 'expo.sqlite.useSQLCipher': true })],
  ])('rejects %s before touching the generated Podfile', (_description, podfileProperties) => {
    expect(() => prepareIosDeviceLabPodfile({ podfile, podfileProperties }))
      .toThrow('expo_sqlite_sqlcipher_property_invalid');
  });

  it.each([
    ['a missing Maps path line', podfile.replace(`${generatedMapsLine}\n`, '')],
    ['a duplicate Maps path line', `${podfile}${generatedMapsLine}\n`],
    ['an unexpected Maps path line', podfile.replace(generatedMapsLine, "  rn_maps_path = '../other-package'")],
    ['an absolute Maps path line', podfile.replace(generatedMapsLine, "  rn_maps_path = '/Users/runner/work/anicare/anicare/node_modules/react-native-maps'")],
  ])('rejects %s', (_description, candidate) => {
    expect(() => prepareIosDeviceLabPodfile({
      podfile: candidate,
      podfileProperties: enabledProperties,
    })).toThrow('rn_maps_path_invalid');
  });
});
