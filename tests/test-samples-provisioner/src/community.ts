type Row = Readonly<Record<string, unknown>>;
export async function ensureCommunitySample(adapter: {read:()=>Promise<Row|null>;insert:()=>Promise<unknown>}, expected: Row): Promise<boolean> {
  const existing = await adapter.read();
  if (existing) {
    if (Object.entries(expected).some(([key,value]) => existing[key] !== value)) throw new Error('test_sample_community_collision');
    // Never resurrect a removed fixture or reset real replies/reactions.
    return !existing.deleted_at && !existing.moderation_hidden_at;
  }
  await adapter.insert();
  return true;
}
