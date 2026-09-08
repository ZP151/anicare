export const PROFILE_AVATAR_KEYS = ['cat', 'paw', 'leaf', 'sun', 'moon', 'heart'] as const;
export type ProfileAvatarKey = typeof PROFILE_AVATAR_KEYS[number];

export function profileAvatarKey(value: unknown): ProfileAvatarKey {
  return typeof value === 'string' && (PROFILE_AVATAR_KEYS as readonly string[]).includes(value)
    ? value as ProfileAvatarKey
    : 'cat';
}
