import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { resolveIdentityReview, type IdentityDecision, type IdentitySource } from '../../lib/identity-api';
import { getIdentityReviewerSession } from '../../lib/identity-session';
import { createWritableAdminServerClient } from '../../lib/supabase/server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function formValue(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === 'string' ? value : null;
}

function failure(proposalId: string | null, requestId: string | null): never {
  const query = new URLSearchParams({ error: 'identity_failed' });
  if (proposalId && UUID.test(proposalId)) query.set('proposalId', proposalId);
  if (requestId && UUID.test(requestId)) query.set('requestId', requestId);
  redirect(`/identity?${query.toString()}`);
}

export async function resolveIdentityReviewAction(source: IdentitySource, formData: FormData): Promise<void> {
  'use server';

  const proposalId = formValue(formData, 'proposalId');
  const requestId = formValue(formData, 'requestId');
  const decision = formValue(formData, 'decision');
  const rationale = formValue(formData, 'rationale');
  const alias = formValue(formData, 'alias');
  if (!proposalId || !requestId || !decision || !rationale || !UUID.test(proposalId) || !UUID.test(requestId)
    || !['manual_search', 'ai_candidate', 'new_animal'].includes(source)
    || !['confirm', 'reject', 'needs_more_evidence'].includes(decision)) failure(proposalId, requestId);

  const session = await getIdentityReviewerSession(async () => (await createWritableAdminServerClient()) as never);
  if (session.state === 'unauthenticated') redirect('/login');
  if (session.state !== 'authorised') failure(proposalId, requestId);
  try {
    const resolution = {
      proposalId,
      source,
      decision: decision as IdentityDecision,
      rationale,
      requestId,
      ...(source === 'new_animal' && decision === 'confirm' && alias ? { alias } : {}),
    };
    await resolveIdentityReview(session.client, resolution);
  } catch {
    failure(proposalId, requestId);
  }
  revalidatePath('/identity');
  redirect('/identity');
}
