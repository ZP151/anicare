import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { PROFILE_AVATAR_EMOJI, profileAvatarKey } from './profile-avatar';

/** One rendering primitive for profile presets and a validated, short-lived photo URI. */
export function ProfileAvatar({ avatarKey, photoUri, size = 42 }: { avatarKey: unknown; photoUri?: string | null; size?: number }) {
  const key = profileAvatarKey(avatarKey);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [photoUri]);
  return <View style={[styles.root, { width: size, height: size, borderRadius: size / 2 }]}>
    {photoUri && !failed ? <Image accessibilityLabel="Photo avatar" onError={() => setFailed(true)} source={{ uri: photoUri }} style={{ width: size, height: size, borderRadius: size / 2 }} /> : <Text style={{ fontSize: size * .56 }}>{PROFILE_AVATAR_EMOJI[key]}</Text>}
  </View>;
}
const styles = StyleSheet.create({ root: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' } });
