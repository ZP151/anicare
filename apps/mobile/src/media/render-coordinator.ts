import type { PrivacyMask } from './contracts';

type RenderOperation = Readonly<{ token: number; masks: readonly PrivacyMask[] }>;

export function createRenderCoordinator() {
  let generation = 0;
  let inFlight = false;

  return {
    beginSelection(): Readonly<{ token: number }> {
      generation += 1;
      inFlight = true;
      return { token: generation };
    },
    beginMutation(masks: readonly PrivacyMask[]): RenderOperation | null {
      if (inFlight) return null;
      generation += 1;
      inFlight = true;
      const snapshot = masks.map((mask) => Object.freeze({
        id: mask.id,
        rect: Object.freeze({ ...mask.rect }),
      }));
      return { token: generation, masks: Object.freeze(snapshot) };
    },
    isCurrent(token: number): boolean {
      return inFlight && token === generation;
    },
    finish(token: number): boolean {
      if (!inFlight || token !== generation) return false;
      inFlight = false;
      return true;
    },
  };
}
