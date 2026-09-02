import { File, Paths } from 'expo-file-system';

export async function cleanupOwnedCameraSourceWithDependencies(
  uri: string,
  dependencies: Readonly<{ cacheRootUri: string; deleteFile(uri: string): Promise<void> }>,
): Promise<boolean> {
  const root = dependencies.cacheRootUri.endsWith('/') ? dependencies.cacheRootUri : `${dependencies.cacheRootUri}/`;
  if (!uri.startsWith(root) || uri.includes('..')) return false;
  await dependencies.deleteFile(uri);
  return true;
}

export function cleanupOwnedCameraSource(uri: string): Promise<boolean> {
  return cleanupOwnedCameraSourceWithDependencies(uri, {
    cacheRootUri: Paths.cache.uri,
    deleteFile: async (ownedUri) => {
      const file = new File(ownedUri);
      if (file.exists) file.delete();
    },
  });
}
