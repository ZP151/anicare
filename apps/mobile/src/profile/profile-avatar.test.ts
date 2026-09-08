import { profileAvatarKey } from './profile-avatar';

describe('profile avatar keys', () => {
  it('accepts only the server-supported avatar keys and falls back safely', () => {
    expect(profileAvatarKey('moon')).toBe('moon');
    expect(profileAvatarKey('portrait-uri')).toBe('cat');
    expect(profileAvatarKey(null)).toBe('cat');
  });
});
