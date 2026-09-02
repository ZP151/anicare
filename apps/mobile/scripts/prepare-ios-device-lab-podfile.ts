import { readFileSync, writeFileSync } from 'node:fs';

const generatedMapsLine = '  rn_maps_path = File.dirname(`node --print "require.resolve(\'react-native-maps/package.json\')"`) ';
const normalizedMapsLine = "  rn_maps_path = '../node_modules/react-native-maps'";

export function prepareIosDeviceLabPodfile(input: Readonly<{
  podfile: string;
  podfileProperties: string;
}>): string {
  assertSqlCipherEnabled(input.podfileProperties);

  const lines = input.podfile.replace(/\r\n/g, '\n').split('\n');
  const mapsLineIndexes = lines.reduce<number[]>((indexes, line, index) => {
    if (line.trimStart().startsWith('rn_maps_path')) indexes.push(index);
    return indexes;
  }, []);

  if (mapsLineIndexes.length !== 1 || lines[mapsLineIndexes[0]] !== generatedMapsLine) {
    throw new Error('rn_maps_path_invalid');
  }

  lines[mapsLineIndexes[0]] = normalizedMapsLine;
  return lines.join('\n');
}

function assertSqlCipherEnabled(podfileProperties: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(podfileProperties);
  } catch {
    throw new Error('expo_sqlite_sqlcipher_property_invalid');
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    Array.isArray(parsed) ||
    (parsed as Readonly<Record<string, unknown>>)['expo.sqlite.useSQLCipher'] !== 'true'
  ) {
    throw new Error('expo_sqlite_sqlcipher_property_invalid');
  }
}

function main(argv: readonly string[]): void {
  if (argv.length !== 2) throw new Error('ios_device_lab_podfile_arguments_invalid');
  const [podfilePath, podfilePropertiesPath] = argv;
  const podfileProperties = readFileSync(podfilePropertiesPath, 'utf8');
  const podfile = readFileSync(podfilePath, 'utf8');
  const normalizedPodfile = prepareIosDeviceLabPodfile({ podfile, podfileProperties });
  writeFileSync(podfilePath, normalizedPodfile);
}

if (require.main === module) main(process.argv.slice(2));
