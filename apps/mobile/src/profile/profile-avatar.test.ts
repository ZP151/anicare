import { profileAvatarKey } from './profile-avatar';

describe('profile avatar keys', () => {
  it('accepts only the server-supported avatar keys and falls back safely', () => {
    expect(profileAvatarKey('moon')).toBe('moon');
    expect(profileAvatarKey('human-12')).toBe('human-12');
    expect(profileAvatarKey('person')).toBe('person');
    expect(profileAvatarKey('portrait-uri')).toBe('person');
    expect(profileAvatarKey(null)).toBe('person');
  });
});
