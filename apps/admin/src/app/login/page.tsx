import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { createAdminServerClient } from '../../lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; sent?: string }> }) {
  const client = await createAdminServerClient();
  const parameters = await searchParams;

  async function requestSignIn(formData: FormData): Promise<void> {
    'use server';

    try {
      const email = formData.get('email');
      const currentClient = await createAdminServerClient();
      const origin = (await headers()).get('origin');
      if (typeof email === 'string' && origin && currentClient) {
        const callback = new URL('/auth/callback?next=/', origin);
        await currentClient.auth.signInWithOtp({ email, options: { emailRedirectTo: callback.toString() } });
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
        {!client ? <p role="alert">The operations console is unavailable because its public connection is not configured.</p> : (
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
