import * as SecureStore from 'expo-secure-store';
import { buildRecordCareArgs, careId, type CareInput } from '../api/care';

export type PendingCare = Readonly<{ kind: 'record' | 'correct'; targetId: string; input: CareInput }>
  | Readonly<{ kind: 'withdraw'; targetId: string; requestId: string }>;
function key(owner: string): string {
  if (!careId(owner)) throw new Error('invalid_care_owner');
  return `care.pending.${owner}`;
}
function validate(value: unknown): PendingCare {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_pending_care');
  const pending = value as PendingCare;
  if (!careId(pending.targetId) || Object.keys(value).length !== 3) throw new Error('invalid_pending_care');
  if (pending.kind === 'withdraw') {
    if (!careId(pending.requestId)) throw new Error('invalid_pending_care');
  } else if (pending.kind === 'record' || pending.kind === 'correct') {
    buildRecordCareArgs(pending.input);
    if (pending.kind === 'record' && pending.targetId !== pending.input.animalId) throw new Error('invalid_pending_care');
  } else throw new Error('invalid_pending_care');
  return pending;
}
export async function loadPendingCare(owner: string): Promise<PendingCare | null> {
  const stored = await SecureStore.getItemAsync(key(owner));
  return stored ? validate(JSON.parse(stored)) : null;
}
const writers = new Map<string, Promise<void>>();
async function exclusive(owner: string, write: () => Promise<void>): Promise<void> {
  const previous = writers.get(owner) ?? Promise.resolve();
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const tail = previous.then(() => held);
  writers.set(owner, tail);
  await previous;
  try { await write(); }
  finally { release(); if (writers.get(owner) === tail) writers.delete(owner); }
}
export async function savePendingCare(owner: string, pending: PendingCare): Promise<void> {
  validate(pending);
  await exclusive(owner, async () => {
    const prior = await loadPendingCare(owner);
    if (prior && JSON.stringify(prior) !== JSON.stringify(pending)) throw new Error('pending_care_exists');
    await SecureStore.setItemAsync(key(owner), JSON.stringify(pending));
  });
}
export async function clearPendingCare(owner: string, pending: PendingCare): Promise<void> {
  await exclusive(owner, async () => {
    const current = await loadPendingCare(owner);
    if (JSON.stringify(current) === JSON.stringify(pending)) await SecureStore.deleteItemAsync(key(owner));
  });
}
