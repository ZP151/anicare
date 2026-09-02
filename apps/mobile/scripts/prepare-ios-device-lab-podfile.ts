import { lstatSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

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

export function prepareIosDeviceLabPodfileAtRoot(appRoot: string): void {
  const realAppRoot = realpathSync(appRoot);
  const iosRoot = resolve(realAppRoot, 'ios');
  const realIosRoot = realDirectoryWithin(realAppRoot, iosRoot);
  const podfilePath = regularFileWithin(realIosRoot, resolve(realIosRoot, 'Podfile'));
  const podfilePropertiesPath = regularFileWithin(realIosRoot, resolve(realIosRoot, 'Podfile.properties.json'));
  const normalizedPodfile = prepareIosDeviceLabPodfile({
    podfile: readFileSync(podfilePath, 'utf8'),
    podfileProperties: readFileSync(podfilePropertiesPath, 'utf8'),
  });

  regularFileWithin(realIosRoot, podfilePath);
  writeFileSync(podfilePath, normalizedPodfile);
}

function realDirectoryWithin(root: string, candidate: string): string {
  try {
    const stats = lstatSync(candidate);
    if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error();
    const realCandidate = realpathSync(candidate);
    if (!isWithin(root, realCandidate)) throw new Error();
    return realCandidate;
  } catch {
    throw new Error('ios_device_lab_podfile_file_invalid');
  }
}

function regularFileWithin(root: string, candidate: string): string {
  try {
    const stats = lstatSync(candidate);
    if (!stats.isFile() || stats.isSymbolicLink()) throw new Error();
    const realCandidate = realpathSync(candidate);
    if (!isWithin(root, realCandidate)) throw new Error();
    return realCandidate;
  } catch {
    throw new Error('ios_device_lab_podfile_file_invalid');
  }
}

function isWithin(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path.length > 0 && !path.startsWith('..');
}

function main(argv: readonly string[]): void {
  if (argv.length !== 0) throw new Error('ios_device_lab_podfile_arguments_invalid');
  prepareIosDeviceLabPodfileAtRoot(resolve(__dirname, '..'));
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    const code = error instanceof Error && /^[a-z0-9_]+$/.test(error.message)
      ? error.message
      : 'ios_device_lab_podfile_file_invalid';
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  }
}
