import { redirect } from 'next/navigation';

import { getAdminAppUrl, isAdminLoginConfigured } from '../../lib/supabase/config';
import { createAdminServerClient, createWritableAdminServerClient } from '../../lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; sent?: string }> }) {
  const configured = isAdminLoginConfigured();
  let client = null;
  if (configured) {
    try {
      client = await createAdminServerClient();
    } catch {
      client = null;
    }
  }
  const parameters = await searchParams;

  async function requestSignIn(formData: FormData): Promise<void> {
    'use server';

    const appUrl = getAdminAppUrl();
    if (!isAdminLoginConfigured() || !appUrl) redirect('/login?error=unavailable');
    let currentClient;
    try {
      currentClient = await createWritableAdminServerClient();
    } catch {
      redirect('/login?error=unavailable');
    }
    if (!currentClient) redirect('/login?error=unavailable');
    try {
      const email = formData.get('email');
      if (typeof email === 'string') {
        const callback = new URL('/auth/callback?next=/', appUrl);
        await currentClient.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: callback.toString(), shouldCreateUser: false },
        });
      }
    } catch {
      // Keep unknown, invalid, and delivery-failed addresses indistinguishable.
    }
    redirect('/login?sent=1');
  }

  return (
    <main>
      <section className="panel">
        <p className="eyebrow">WhiskerCommons operations</p>
        <h1>Sign in</h1>
        {parameters.error ? <p role="alert">We could not complete that sign-in. Request a new link.</p> : null}
        {parameters.sent ? <p role="status">If an account can receive this email, a sign-in link has been sent.</p> : null}
        {!configured || !client ? <p role="alert">The operations console is unavailable because its required configuration is not available.</p> : (
          <form action={requestSignIn}>
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" autoComplete="email" required />
            <button type="submit">Send sign-in link</button>
          </form>
        )}
      </section>
    </main>
  );
}
