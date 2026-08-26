import { NextResponse } from 'next/server';

import { createAdminServerClient } from '../../../lib/supabase/server';

export const dynamic = 'force-dynamic';

function allowedRedirect(value: string | null): '/' {
  return value === '/' ? '/' : '/';
}

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = allowedRedirect(url.searchParams.get('next'));
  const client = await createAdminServerClient();

  if (!code || !client) return NextResponse.redirect(new URL('/login?error=callback_failed', request.url));

  const { error } = await client.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL('/login?error=callback_failed', request.url));
  return NextResponse.redirect(new URL(next, request.url));
}
