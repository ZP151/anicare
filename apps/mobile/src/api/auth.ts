export function normalizeContributionEmail(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error('invalid_email');
  }
  return normalized;
}

export function extractAuthCode(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).searchParams.get('code');
  } catch {
    return null;
  }
}

export function buildOAuthOptions(redirectTo: string) {
  return { redirectTo, skipBrowserRedirect: true } as const;
}
