import { NextResponse } from 'next/server';

import { getAdminAppUrl } from '../../../lib/supabase/config';
import { createWritableAdminServerClient } from '../../../lib/supabase/server';

export const dynamic = 'force-dynamic';

function allowedRedirect(value: string | null): '/' {
  return value === '/' ? '/' : '/';
}

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = allowedRedirect(url.searchParams.get('next'));
  const appUrl = getAdminAppUrl();
  if (!appUrl) return NextResponse.json({ error: 'callback_failed' }, { status: 503 });
  const client = await createWritableAdminServerClient();

  if (!code || !client) return NextResponse.redirect(new URL('/login?error=callback_failed', appUrl));

  const { error } = await client.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL('/login?error=callback_failed', appUrl));
  return NextResponse.redirect(new URL(next, appUrl));
}
