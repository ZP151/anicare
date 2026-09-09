export const PROFILE_AVATAR_KEYS = [
  'person', 'human-01', 'human-02', 'human-03', 'human-04', 'human-05', 'human-06', 'human-07',
  'human-08', 'human-09', 'human-10', 'human-11', 'human-12', 'human-13', 'human-14', 'human-15',
  'cat', 'paw', 'leaf', 'sun', 'moon', 'heart',
] as const;
export type ProfileAvatarKey = typeof PROFILE_AVATAR_KEYS[number];

export const PROFILE_AVATAR_EMOJI: Readonly<Record<ProfileAvatarKey, string>> = {
  person: '🧑', 'human-01': '👩🏻', 'human-02': '👩🏽', 'human-03': '👩🏿', 'human-04': '👨🏻',
  'human-05': '👨🏽', 'human-06': '👨🏿', 'human-07': '🧕🏽', 'human-08': '👩‍🦰', 'human-09': '👨‍🦱',
  'human-10': '👩‍🦳', 'human-11': '👨‍🦲', 'human-12': '🧑🏻‍🦽', 'human-13': '🧑🏽‍🦯',
  'human-14': '🧑🏿‍🦼', 'human-15': '🧑‍🦰', cat: '🐱', paw: '🐾', leaf: '🍃', sun: '☀️', moon: '🌙', heart: '♥️',
};

export function profileAvatarKey(value: unknown): ProfileAvatarKey {
  return typeof value === 'string' && (PROFILE_AVATAR_KEYS as readonly string[]).includes(value)
    ? value as ProfileAvatarKey
    : 'person';
}
