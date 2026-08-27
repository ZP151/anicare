import { createProcessorCacheLifecycle } from './processor-cache-lifecycle';

describe('processor cache lifecycle', () => {
  function setup() {
    const cleaned: string[][] = [];
    const lifecycle = createProcessorCacheLifecycle(async (uris) => {
      cleaned.push([...uris]);
    });
    return { cleaned, lifecycle };
  }

  it('deletes outputs adopted by an abandoned operation immediately', async () => {
    const { cleaned, lifecycle } = setup();
    await lifecycle.startSelection(1);
    await lifecycle.adopt(1, 'file:///cache/animalhelper-canonical-old.jpg');
    lifecycle.startSelection(2);

    await lifecycle.adopt(1, 'file:///cache/animalhelper-reviewed-stale.jpg');

    expect(cleaned).toEqual([[
      'file:///cache/animalhelper-canonical-old.jpg',
    ], [
      'file:///cache/animalhelper-reviewed-stale.jpg',
    ]]);
  });

  it('deletes previous selection caches before the replacement can adopt outputs', async () => {
    const { cleaned, lifecycle } = setup();
    await lifecycle.startSelection(1);
    await lifecycle.adopt(1, 'file:///cache/animalhelper-canonical-old.jpg');

    await lifecycle.startSelection(2);
    await lifecycle.adopt(2, 'file:///cache/animalhelper-canonical-new.jpg');

    expect(cleaned).toEqual([
      ['file:///cache/animalhelper-canonical-old.jpg'],
    ]);
  });

  it('keeps the current review owned while a replacement picker is pending or cancelled', async () => {
    const { cleaned, lifecycle } = setup();
    await lifecycle.startSelection(1);
    await lifecycle.adopt(1, 'file:///cache/animalhelper-reviewed-current.jpg');

    // A coordinator token can be reserved while the picker is open. The
    // lifecycle is not replaced until a source is actually selected.
    expect(lifecycle.ownedUris()).toEqual(['file:///cache/animalhelper-reviewed-current.jpg']);
    expect(cleaned).toEqual([]);

    await lifecycle.startSelection(2);
    expect(cleaned).toEqual([['file:///cache/animalhelper-reviewed-current.jpg']]);
  });

  it('defers unmount cleanup until in-flight processing has stopped', async () => {
    const { cleaned, lifecycle } = setup();
    await lifecycle.startSelection(1);
    await lifecycle.adopt(1, 'file:///cache/animalhelper-canonical-current.jpg');
    lifecycle.beginAsyncWork();

    const cleanup = lifecycle.requestCleanup();
    await Promise.resolve();
    expect(cleaned).toEqual([]);

    await lifecycle.endAsyncWork();
    await cleanup;
    expect(cleaned).toEqual([[
      'file:///cache/animalhelper-canonical-current.jpg',
    ]]);
  });

  it('does not clean a URI twice when commit cleanup and unmount cleanup overlap', async () => {
    const { cleaned, lifecycle } = setup();
    await lifecycle.startSelection(1);
    await lifecycle.adopt(1, 'file:///cache/animalhelper-reviewed-current.jpg');

    await lifecycle.cleanupOwned([
      'file:///cache/animalhelper-reviewed-current.jpg',
      'file:///documents/reviewed-media/media-123.commit-123.agcm',
    ]);
    await lifecycle.requestCleanup();

    expect(cleaned).toEqual([[
      'file:///cache/animalhelper-reviewed-current.jpg',
    ]]);
  });

  it('reactivates only through an explicit mount transition, while late abandoned output is still deleted', async () => {
    const { cleaned, lifecycle } = setup();
    await lifecycle.startSelection(1);
    await lifecycle.adopt(1, 'file:///cache/animalhelper-reviewed-old.jpg');
    await lifecycle.requestCleanup();

    lifecycle.reactivate();
    await lifecycle.startSelection(2);
    lifecycle.beginAsyncWork();
    await lifecycle.adopt(2, 'file:///cache/animalhelper-reviewed-new.jpg');
    await lifecycle.adopt(1, 'file:///cache/animalhelper-reviewed-late.jpg');
    await lifecycle.endAsyncWork();

    expect(cleaned).toEqual([
      ['file:///cache/animalhelper-reviewed-old.jpg'],
      ['file:///cache/animalhelper-reviewed-late.jpg'],
    ]);
    expect(lifecycle.ownedUris()).toEqual(['file:///cache/animalhelper-reviewed-new.jpg']);
  });
});
