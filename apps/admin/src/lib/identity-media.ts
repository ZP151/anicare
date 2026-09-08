import 'server-only';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_MEDIA_BYTES = 20 * 1024 * 1024;

export type IdentityMediaReference = Readonly<{ storageBucket: 'media-staging'; storagePath: string; byteLength: number }>;

export async function serveIdentityReviewMedia(
  input: Readonly<{ proposalId: string }>,
  dependencies: Readonly<{
    getUser(): Promise<string | null>;
    getReference(actorId: string, proposalId: string): Promise<IdentityMediaReference | null>;
    download(reference: IdentityMediaReference): Promise<Blob | null>;
    isStillAuthorised(actorId: string, proposalId: string, reference: IdentityMediaReference): Promise<boolean>;
  }>,
): Promise<Response> {
  const unavailable = () => new Response(null, { status: 404, headers: { 'cache-control': 'private, no-store' } });
  if (!UUID.test(input.proposalId)) return unavailable();
  try {
    const actorId = await dependencies.getUser();
    if (!actorId || !UUID.test(actorId)) return unavailable();
    const reference = await dependencies.getReference(actorId, input.proposalId);
    if (!reference || reference.storageBucket !== 'media-staging' || !Number.isInteger(reference.byteLength) || reference.byteLength < 1 || reference.byteLength > MAX_MEDIA_BYTES) return unavailable();
    const media = await dependencies.download(reference);
    if (!media || media.size !== reference.byteLength || media.size > MAX_MEDIA_BYTES || media.type.toLowerCase().split(';')[0] !== 'image/jpeg') return unavailable();
    if (!await dependencies.isStillAuthorised(actorId, input.proposalId, reference)) return unavailable();
    return new Response(await media.arrayBuffer(), {
      status: 200,
      headers: {
        'content-type': 'image/jpeg',
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer',
      },
    });
  } catch {
    return unavailable();
  }
}
