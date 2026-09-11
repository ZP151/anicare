import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {samples} from './fixtures.js';
import {canUpgradeNoPhotoPortrait} from './fixture-upgrade.js';

const legacySha = (fixtureKey: string) => createHash('sha256').update(`synthetic-test:${fixtureKey}`).digest('hex');

test('allows only the declared untouched Biscuit and Willow no-photo fixtures to gain a portrait', () => {
  for (const key of ['ios26-s15', 'ios26-s16']) {
    const sample = samples.find(candidate => candidate[0] === key)!;
    assert.equal(canUpgradeNoPhotoPortrait(sample, {animalId: sample[1], sourceSha256: legacySha(key)}), true);
  }
});

test('never treats a changed, unrelated, or still-no-photo ledger row as an upgrade', () => {
  const biscuit = samples.find(candidate => candidate[0] === 'ios26-s15')!;
  const echo = samples.find(candidate => candidate[0] === 'ios26-s05')!;
  assert.equal(canUpgradeNoPhotoPortrait(biscuit, {animalId: biscuit[1], sourceSha256: 'a'.repeat(64)}), false);
  assert.equal(canUpgradeNoPhotoPortrait(biscuit, {animalId: echo[1], sourceSha256: legacySha('ios26-s15')}), false);
  assert.equal(canUpgradeNoPhotoPortrait(echo, {animalId: echo[1], sourceSha256: legacySha('ios26-s05')}), false);
});