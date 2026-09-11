import {createHash} from 'node:crypto';

type Fixture = readonly [fixtureKey: string, animalId: string, alias: string, filename: string | null, publicCellId: string];

type ExistingFixture = Readonly<{animalId: string; sourceSha256: string}>;

const portraitUpgradeKeys = new Set(['ios26-s15', 'ios26-s16']);

export function canUpgradeNoPhotoPortrait(sample: Fixture, existing: ExistingFixture): boolean {
  const [fixtureKey, animalId, , filename] = sample;
  const legacySha = createHash('sha256').update(`synthetic-test:${fixtureKey}`).digest('hex');
  return portraitUpgradeKeys.has(fixtureKey) && filename !== null && existing.animalId === animalId && existing.sourceSha256 === legacySha;
}