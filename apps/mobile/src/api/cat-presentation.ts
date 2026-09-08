import { getSupabaseClient } from './supabase';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAMPLE_LABEL = /^测试样本(?: [A-Z]\d\d)?$/;
const MAX_SIGNED_URL_TTL_SECONDS = 60;

export type CatPresentation = Readonly<{ portraitUri?: string; sampleLabel?: string }>;

type PresentationClient = Readonly<{
  rpc(name: 'get_public_cat_presentations', input: Readonly<{ p_animal_ids: string[] }>): PromiseLike<Readonly<{ data: unknown; error: unknown | null }>>;
  storage: Readonly<{ from(bucket: 'cat-portraits'): Readonly<{
    createSignedUrls(paths: string[], expiresIn: number): PromiseLike<Readonly<{ data: unknown; error: unknown | null }>>;
  }> }>;
}>;

type PresentationRow = Readonly<{ animalId: string; portraitPath: string | null; sampleLabel: string | undefined }>;

function validSignedPortraitUrl(value: unknown, path: string, expectedOrigin: string): value is string {
  if (typeof value !== 'string') return false;
  try {
    const signed = new URL(value);
    const origin = new URL(expectedOrigin);
    const expectedPath = `/storage/v1/object/sign/cat-portraits/${path}`;
    return origin.protocol === 'https:' && signed.protocol === 'https:' && signed.origin === origin.origin &&
      signed.username === '' && signed.password === '' && signed.pathname === expectedPath &&
      [...signed.searchParams.keys()].every((key) => key === 'token') && signed.searchParams.getAll('token').length === 1 &&
      signed.searchParams.get('token') !== '';
  } catch { return false; }
}

function parseRows(data: unknown, requestedIds: Set<string>): PresentationRow[] | null {
  if (!Array.isArray(data)) return null;
  const rows: PresentationRow[] = [];
  for (const value of data) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const row = value as Record<string, unknown>;
    if (Object.keys(row).some((key) => !['animalId', 'portraitPath', 'sampleLabel'].includes(key)) ||
      typeof row.animalId !== 'string' || !requestedIds.has(row.animalId.toLowerCase()) ||
      (row.portraitPath !== null && typeof row.portraitPath !== 'string') ||
      (row.sampleLabel !== null && (typeof row.sampleLabel !== 'string' || !SAMPLE_LABEL.test(row.sampleLabel)))) return null;
    const animalId = row.animalId.toLowerCase();
    const portraitPath = row.portraitPath;
    if (portraitPath !== null && portraitPath !== `synthetic-test/${animalId}/portrait.jpg`) return null;
    rows.push({ animalId, portraitPath, sampleLabel: row.sampleLabel ?? undefined });
  }
  return rows;
}

export async function getCatPresentations(animalIds: readonly string[], client: PresentationClient | null = getSupabaseClient() as unknown as PresentationClient | null, expectedOrigin = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''): Promise<Map<string, CatPresentation>> {
  const ids = [...new Set(animalIds.map((id) => id.toLowerCase()))];
  if (!client || ids.length === 0 || ids.length > 50 || ids.some((id) => !UUID.test(id))) return new Map();
  try {
    const reply = await client.rpc('get_public_cat_presentations', { p_animal_ids: ids });
    if (reply.error) return new Map();
    const rows = parseRows(reply.data, new Set(ids));
    if (rows === null) return new Map();
    const paths = rows.flatMap((row) => row.portraitPath === null ? [] : [row.portraitPath]);
    const signed = paths.length === 0 ? null : await client.storage.from('cat-portraits').createSignedUrls(paths, MAX_SIGNED_URL_TTL_SECONDS);
    if (signed?.error) return new Map();
    const signedData = signed === null ? [] : signed.data;
    if (!Array.isArray(signedData)) return new Map(rows.map((row) => [row.animalId, row.sampleLabel === undefined ? {} : { sampleLabel: row.sampleLabel }]));
    const urls = new Map<string, string>();
    for (const value of signedData) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const row = value as Record<string, unknown>;
      if (typeof row.path !== 'string' || !paths.includes(row.path) || !validSignedPortraitUrl(row.signedUrl, row.path, expectedOrigin)) continue;
      urls.set(row.path, row.signedUrl as string);
    }
    return new Map(rows.map((row) => [row.animalId, {
      ...(row.portraitPath === null || !urls.has(row.portraitPath) ? {} : { portraitUri: urls.get(row.portraitPath) }),
      ...(row.sampleLabel === undefined ? {} : { sampleLabel: row.sampleLabel }),
    }]));
  } catch {
    return new Map();
  }
}
