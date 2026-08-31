export async function runIsolatedAttempts<Scenario>(
  attempts: number,
  create: (attempt: number) => Promise<Scenario>,
  run: (scenario: Scenario, attempt: number) => Promise<void>,
  destroy: (scenario: Scenario, attempt: number) => Promise<void>,
): Promise<void> {
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 5) {
    throw new Error('invalid_isolated_attempt_count');
  }
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const scenario = await create(attempt);
    try {
      await run(scenario, attempt);
    } finally {
      await destroy(scenario, attempt);
    }
  }
}

export function createTwoPartyStartBarrier(
  onReady?: (release: () => void) => void,
): () => Promise<void> {
  let arrivals = 0;
  let released = false;
  let resolveBarrier: (() => void) | undefined;
  const barrier = new Promise<void>((resolve) => {
    resolveBarrier = resolve;
  });
  const release = () => {
    if (released) return;
    released = true;
    resolveBarrier?.();
  };

  return async () => {
    if (arrivals >= 2) throw new Error('two_party_start_barrier_overflow');
    arrivals += 1;
    if (arrivals === 2) {
      if (onReady) {
        try {
          onReady(release);
        } catch (error) {
          release();
          throw error;
        }
      } else {
        release();
      }
    }
    await barrier;
  };
}

export async function settleTwoAtBarrier<First, Second>(
  first: () => Promise<First>,
  second: () => Promise<Second>,
): Promise<readonly [PromiseSettledResult<First>, PromiseSettledResult<Second>]> {
  const wait = createTwoPartyStartBarrier();
  const firstStarted = (async () => {
    await wait();
    return first();
  })();
  const secondStarted = (async () => {
    await wait();
    return second();
  })();

  return Promise.allSettled([firstStarted, secondStarted]);
}
