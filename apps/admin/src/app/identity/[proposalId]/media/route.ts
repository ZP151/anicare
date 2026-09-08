import { randomUUID } from 'node:crypto';

import { serveIdentityReviewMedia, type IdentityMediaReference } from '../../../../lib/identity-media';
import { getIdentityReviewerSession } from '../../../../lib/identity-session';
import { createAdminServerClient, createAdminServiceClient } from '../../../../lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function reference(value: unknown): IdentityMediaReference | null {
  if (!Array.isArray(value) || value.length !== 1 || !value[0] || typeof value[0] !== 'object' || Array.isArray(value[0])) return null;
  const row = value[0] as Record<string, unknown>;
  if (Object.keys(row).length !== 3 || row.storageBucket !== 'media-staging' || typeof row.storagePath !== 'string' || !row.storagePath || !Number.isInteger(row.byteLength) || (row.byteLength as number) < 1 || (row.byteLength as number) > 20 * 1024 * 1024) return null;
  return row as unknown as IdentityMediaReference;
}

export async function GET(_request: Request, context: { params: Promise<{ proposalId: string }> }): Promise<Response> {
  const { proposalId } = await context.params;
  return serveIdentityReviewMedia({ proposalId }, {
    getUser: async () => {
      const session = await getIdentityReviewerSession(async () => (await createAdminServerClient()) as never);
      return session.state === 'authorised' ? session.userId : null;
    },
    getReference: async (actorId, stableProposalId) => {
      const service = createAdminServiceClient();
      if (!service) return null;
      const reply = await (service as unknown as { rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }> }).rpc('service_get_identity_review_media', {
        p_actor_id: actorId, p_proposal_id: stableProposalId, p_request_id: randomUUID(),
      });
      if (reply.error) return null;
      return reference(reply.data);
    },
    download: async (media) => {
      const service = createAdminServiceClient();
      if (!service) return null;
      const reply = await service.storage.from(media.storageBucket).download(media.storagePath);
      return reply.error ? null : reply.data;
    },
    isStillAuthorised: async (actorId, stableProposalId, original) => {
      const session = await getIdentityReviewerSession(async () => (await createAdminServerClient()) as never);
      if (session.state !== 'authorised' || session.userId !== actorId) return false;
      const service = createAdminServiceClient();
      if (!service) return false;
      const reply = await (service as unknown as { rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }> }).rpc('service_get_identity_review_media', {
        p_actor_id: actorId, p_proposal_id: stableProposalId, p_request_id: randomUUID(),
      });
      const refreshed = reply.error ? null : reference(reply.data);
      return refreshed !== null && refreshed.storageBucket === original.storageBucket
        && refreshed.storagePath === original.storagePath && refreshed.byteLength === original.byteLength;
    },
  });
}
