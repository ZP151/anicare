import { randomUUID } from 'node:crypto';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { getAdminSession } from '../../lib/admin-session';
import { parseModerationResolution, resolveModerationReport, type ModerationResolution } from '../../lib/moderation-api';
import { createAdminServerClient } from '../../lib/supabase/server';

function hasExactFormFields(formData: FormData, expected: readonly string[]): boolean {
  const actual = Array.from(formData.keys()).sort();
  return actual.length === expected.length && actual.every((key, index) => key === [...expected].sort()[index]);
}

export function parseModerationResolutionForm(formData: FormData): ModerationResolution {
  if (!hasExactFormFields(formData, ['reportId', 'action', 'rationale'])) {
    throw new Error('invalid_moderation_resolution_form');
  }

  try {
    return parseModerationResolution({
      reportId: formData.get('reportId'),
      action: formData.get('action'),
      rationale: formData.get('rationale'),
    });
  } catch {
    throw new Error('invalid_moderation_resolution_form');
  }
}

export async function resolveModerationReportAction(formData: FormData): Promise<void> {
  'use server';

  const input = parseModerationResolutionForm(formData);
  const session = await getAdminSession(async () => (await createAdminServerClient()) as never);
  if (session.state === 'unauthenticated') redirect('/login');
  if (session.state !== 'authorised') throw new Error('moderation_unavailable');

  const requestId = randomUUID();
  await resolveModerationReport(session.client, input, requestId);
  revalidatePath('/');
  redirect('/');
}
