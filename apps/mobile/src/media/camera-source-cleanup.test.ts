import { cleanupOwnedCameraSourceWithDependencies } from './camera-source-cleanup.native';

describe('camera source cleanup', () => {
  it('deletes only a camera source proven to be inside the app cache', async () => {
    const deleteFile = jest.fn(async () => undefined);
    await expect(cleanupOwnedCameraSourceWithDependencies(
      'file:///app/cache/ImagePicker/camera.jpg', { cacheRootUri: 'file:///app/cache', deleteFile },
    )).resolves.toBe(true);
    expect(deleteFile).toHaveBeenCalledWith('file:///app/cache/ImagePicker/camera.jpg');
  });

  it.each(['file:///photos/library.jpg', 'file:///app/cache/../photos/library.jpg'])(
    'never deletes an unowned or escaping URI: %s',
    async (uri) => {
      const deleteFile = jest.fn(async () => undefined);
      await expect(cleanupOwnedCameraSourceWithDependencies(
        uri, { cacheRootUri: 'file:///app/cache', deleteFile },
      )).resolves.toBe(false);
      expect(deleteFile).not.toHaveBeenCalled();
    },
  );
});
