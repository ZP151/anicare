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

export async function getCatPresentations(animalIds: readonly string[], client: PresentationClient | null = getSupabaseClient() as unknown as PresentationClient | null): Promise<Map<string, CatPresentation>> {
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
    if (!Array.isArray(signedData)) return new Map();
    const urls = new Map<string, string>();
    for (const value of signedData) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return new Map();
      const row = value as Record<string, unknown>;
      if (typeof row.path !== 'string' || typeof row.signedUrl !== 'string' || !paths.includes(row.path) || !row.signedUrl.startsWith('https://')) return new Map();
      urls.set(row.path, row.signedUrl);
    }
    if (urls.size !== paths.length) return new Map();
    return new Map(rows.map((row) => [row.animalId, {
      ...(row.portraitPath === null ? {} : { portraitUri: urls.get(row.portraitPath) }),
      ...(row.sampleLabel === undefined ? {} : { sampleLabel: row.sampleLabel }),
    }]));
  } catch {
    return new Map();
  }
}
