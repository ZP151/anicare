import { z } from 'zod';

export const MAX_SIGHTING_SUBMISSION_BYTES = 64 * 1024;

const createSubmissionSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  occurredAt: z.iso.datetime({ offset: true }),
  risk: z.enum(['normal', 'sensitive', 'critical']).default('normal'),
  traits: z.record(z.string(), z.unknown()).default({}),
  notes: z.string().trim().max(2000).nullable().default(null),
  clientDedupeKey: z.string().min(8).max(160),
}).strict();

const recoverySubmissionSchema = z.object({
  clientDedupeKey: z.string().min(8).max(160),
  recoverExisting: z.literal(true),
}).strict();

const storedSightingSubmissionSchema = z.object({
  id: z.string().uuid(),
  reporter_id: z.string().uuid(),
  visibility: z.enum(['public', 'hidden']),
  visible_at: z.iso.datetime({ offset: true }).nullable(),
}).strict();

const sightingSubmissionResponseSchema = z.object({
  sightingId: z.string().uuid(),
  visibility: z.enum(['public', 'hidden']),
  visibleAt: z.iso.datetime({ offset: true }).nullable(),
  requestId: z.string().uuid(),
}).strict();

export type CreateSightingSubmission = z.infer<typeof createSubmissionSchema>;
export type RecoverSightingSubmission = z.infer<typeof recoverySubmissionSchema>;
export type SightingSubmission = CreateSightingSubmission | RecoverSightingSubmission;
export type StoredSightingSubmission = z.infer<typeof storedSightingSubmissionSchema>;
export type SightingSubmissionResponse = z.infer<typeof sightingSubmissionResponseSchema>;

export function parseSightingSubmission(value: unknown): SightingSubmission {
  return z.union([createSubmissionSchema, recoverySubmissionSchema]).parse(value);
}

export function parseStoredSightingSubmission(value: unknown): StoredSightingSubmission {
  return storedSightingSubmissionSchema.parse(value);
}

export function ownedStoredSightingSubmission(
  value: unknown,
  reporterId: string,
): StoredSightingSubmission | null {
  const sighting = parseStoredSightingSubmission(value);
  return sighting.reporter_id === reporterId ? sighting : null;
}

export function toSightingSubmissionResponse(
  sighting: StoredSightingSubmission,
  requestId: string,
): SightingSubmissionResponse {
  return sightingSubmissionResponseSchema.parse({
    sightingId: sighting.id,
    visibility: sighting.visibility,
    visibleAt: sighting.visible_at,
    requestId,
  });
}

export function strictBearerToken(request: Request): string | null {
  const match = request.headers.get('authorization')?.match(/^Bearer\s+([^\s]{1,8192})$/i);
  return match?.[1] ?? null;
}

export async function readBoundedSightingSubmissionJson(request: Request): Promise<unknown> {
  const contentLength = request.headers.get('content-length');
  if (contentLength !== null && (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_SIGHTING_SUBMISSION_BYTES)) {
    throw new Error('invalid_request');
  }
  const reader = request.body?.getReader();
  if (!reader) throw new Error('invalid_request');

  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > MAX_SIGHTING_SUBMISSION_BYTES) throw new Error('invalid_request');
    chunks.push(value);
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
