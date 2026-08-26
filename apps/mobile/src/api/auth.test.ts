import { buildOAuthOptions, extractAuthCode, normalizeContributionEmail } from './auth';

describe('normalizeContributionEmail', () => {
  it('normalizes a valid email and rejects malformed input before contacting auth', () => {
    expect(normalizeContributionEmail('  Care.Giver@Example.COM ')).toBe('care.giver@example.com');
    expect(() => normalizeContributionEmail('not-an-email')).toThrow('invalid_email');
  });
});

describe('extractAuthCode', () => {
  it('accepts only a callback URL carrying a PKCE code', () => {
    expect(extractAuthCode('animalhelper://auth/callback?code=secure-code')).toBe('secure-code');
    expect(extractAuthCode('animalhelper://auth/callback?error=denied')).toBeNull();
    expect(extractAuthCode(null)).toBeNull();
  });
});

describe('buildOAuthOptions', () => {
  it('uses the app callback and keeps the system browser under app control', () => {
    expect(buildOAuthOptions('animalhelper://auth/callback')).toEqual({
      redirectTo: 'animalhelper://auth/callback',
      skipBrowserRedirect: true,
    });
  });
});
