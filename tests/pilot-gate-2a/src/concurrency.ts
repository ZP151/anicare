export async function settleTwoAtBarrier<First, Second>(
  first: () => Promise<First>,
  second: () => Promise<Second>,
): Promise<readonly [PromiseSettledResult<First>, PromiseSettledResult<Second>]> {
  let release: (() => void) | undefined;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  const firstStarted = (async () => {
    await barrier;
    return first();
  })();
  const secondStarted = (async () => {
    await barrier;
    return second();
  })();

  release?.();
  return Promise.allSettled([firstStarted, secondStarted]);
}
