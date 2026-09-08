import { getSupabaseClient } from './supabase';

export const CARE_AREAS = [
  { cell: '896520ca163ffff', en: 'Jurong', zh: '裕廊' },
  { cell: '89652636d87ffff', en: 'MacRitchie', zh: '麦里芝' },
  { cell: '896526add03ffff', en: 'Tampines', zh: '淡滨尼' },
] as const;
export const CARE_ACTIVITIES = ['feed', 'water', 'cleanup', 'observe', 'companionship'] as const;
export type CareActivity = typeof CARE_ACTIVITIES[number];
export type CareInput = Readonly<{ animalId: string; activity: CareActivity; completedAt: string; publicCell: string; requestId: string }>;
export type CareReceipt = Readonly<{ careEventId: string; visibleAt: string | null; status: 'recorded' }>;
export type CareCorrection = Readonly<{ careEventId: string; replacementCareEventId: string; status: 'corrected' }>;
export type MyCareEvent = Readonly<{
  careEventId: string; animalId: string; activity: CareActivity; completedAt: string;
  publicCellId: string; createdAt: string; status: 'recorded' | 'withdrawn' | 'corrected'; replacementCareEventId: string | null;
}>;
export type PublicCareEvent = Readonly<{
  careEventId: string; activity: CareActivity; publicCellId: string;
  completedWindow: 'today' | 'this_week' | 'earlier'; provenance: 'reported'; cursor: string;
}>;
export type MyCareCursor = Readonly<{ createdAt: string; careEventId: string }>;
export type CarePage<T, C> = Readonly<{ items: readonly T[]; nextCursor: C | null }>;
type RpcClient = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const careId = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
const date = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v));
const activity = (v: unknown): v is CareActivity => typeof v === 'string' && (CARE_ACTIVITIES as readonly string[]).includes(v);
const cell = (v: unknown): v is string => typeof v === 'string' && CARE_AREAS.some(area => area.cell === v);
function exact(v: unknown, keys: readonly string[]): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
}
async function rpc(name: string, args: Record<string, unknown>, provided?: RpcClient): Promise<unknown> {
  const client = provided ?? getSupabaseClient() as unknown as RpcClient | null;
  if (!client) throw new Error('care_unavailable');
  try {
    const reply = await client.rpc(name, args);
    if (reply.error) throw new Error('care_unavailable');
    return reply.data;
  } catch { throw new Error('care_unavailable'); }
}
function one(data: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!Array.isArray(data) || data.length !== 1 || !exact(data[0], keys)) throw new Error('invalid_care_response');
  return data[0];
}
export function buildRecordCareArgs(input: CareInput) {
  if (!input || !careId(input.animalId) || !activity(input.activity) || !date(input.completedAt) || !cell(input.publicCell) || !careId(input.requestId)) throw new Error('invalid_care_input');
  return { p_animal_id: input.animalId, p_activity: input.activity, p_completed_at: input.completedAt, p_public_cell: input.publicCell, p_request_id: input.requestId };
}
export async function canRecordCare(c?: RpcClient): Promise<boolean> {
  const result = await rpc('is_adult_contributor', {}, c);
  if (typeof result !== 'boolean') throw new Error('invalid_care_response');
  return result;
}
export async function recordCompletedCare(input: CareInput, c?: RpcClient): Promise<CareReceipt> {
  const row = one(await rpc('record_completed_care', buildRecordCareArgs(input), c), ['careEventId', 'visibleAt', 'status']);
  if (!careId(row.careEventId) || !(row.visibleAt === null || date(row.visibleAt)) || row.status !== 'recorded') throw new Error('invalid_care_response');
  return row as CareReceipt;
}
export async function withdrawCareEvent(careEventId: string, requestId: string, c?: RpcClient): Promise<Readonly<{ careEventId: string; status: 'withdrawn' }>> {
  if (!careId(careEventId) || !careId(requestId)) throw new Error('invalid_care_input');
  const row = one(await rpc('withdraw_care_event', { p_care_event_id: careEventId, p_request_id: requestId }, c), ['careEventId', 'status']);
  if (row.careEventId !== careEventId || row.status !== 'withdrawn') throw new Error('invalid_care_response');
  return row as Readonly<{ careEventId: string; status: 'withdrawn' }>;
}
export async function correctCareEvent(careEventId: string, input: Omit<CareInput, 'animalId'>, c?: RpcClient): Promise<CareCorrection> {
  if (!careId(careEventId)) throw new Error('invalid_care_input');
  const args = buildRecordCareArgs({ ...input, animalId: careEventId });
  const row = one(await rpc('correct_care_event', {
    p_care_event_id: careEventId, p_activity: args.p_activity, p_completed_at: args.p_completed_at,
    p_public_cell: args.p_public_cell, p_request_id: args.p_request_id,
  }, c), ['careEventId', 'replacementCareEventId', 'status']);
  if (row.careEventId !== careEventId || !careId(row.replacementCareEventId) || row.status !== 'corrected') throw new Error('invalid_care_response');
  return row as CareCorrection;
}
function parseOwn(v: unknown): MyCareEvent {
  if (!exact(v, ['careEventId','animalId','activity','completedAt','publicCellId','createdAt','status','replacementCareEventId'])
    || !careId(v.careEventId) || !careId(v.animalId) || !activity(v.activity) || !date(v.completedAt) || !date(v.createdAt) || !cell(v.publicCellId)
    || !['recorded','withdrawn','corrected'].includes(v.status as string)
    || (v.status === 'corrected' ? !careId(v.replacementCareEventId) : v.replacementCareEventId !== null)) throw new Error('invalid_my_care');
  return v as MyCareEvent;
}
export async function listMyCareEvents(input: Readonly<{ cursor?: MyCareCursor | null }> = {}, c?: RpcClient): Promise<CarePage<MyCareEvent, MyCareCursor>> {
  const cursor = input.cursor;
  if (cursor && (!careId(cursor.careEventId) || !date(cursor.createdAt))) throw new Error('invalid_my_care');
  const data = await rpc('list_my_care_events', { p_limit: 20, p_before_created_at: cursor?.createdAt ?? null, p_before_care_event_id: cursor?.careEventId ?? null }, c);
  if (!Array.isArray(data) || data.length > 20) throw new Error('invalid_my_care');
  const items = data.map(parseOwn); const last = items.at(-1);
  return { items, nextCursor: items.length === 20 && last ? { createdAt: last.createdAt, careEventId: last.careEventId } : null };
}
function parsePublic(v: unknown): PublicCareEvent {
  if (!exact(v, ['careEventId','activity','publicCellId','completedWindow','provenance','cursor'])
    || !careId(v.careEventId) || v.cursor !== v.careEventId || !activity(v.activity) || !cell(v.publicCellId)
    || !['today','this_week','earlier'].includes(v.completedWindow as string) || v.provenance !== 'reported') throw new Error('invalid_public_care');
  return v as PublicCareEvent;
}
export async function listPublicCareHistory(animalId: string, cursor: string | null = null, c?: RpcClient): Promise<CarePage<PublicCareEvent, string>> {
  if (!careId(animalId) || cursor !== null && !careId(cursor)) throw new Error('invalid_public_care');
  const data = await rpc('list_public_care_history', { p_animal_id: animalId, p_cursor: cursor, p_limit: 20 }, c);
  if (!Array.isArray(data) || data.length > 20) throw new Error('invalid_public_care');
  const items = data.map(parsePublic);
  return { items, nextCursor: items.length === 20 ? items.at(-1)!.cursor : null };
}
