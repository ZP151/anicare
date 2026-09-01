import { makeRedirectUri } from 'expo-auth-session';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { buildOAuthOptions, extractAuthCode, normalizeContributionEmail } from '../../src/api/auth';
import { resumeValidatedReportDraft, validatedReturnDraftId } from '../../src/auth/profile-report-return';
import { getSupabaseClient } from '../../src/api/supabase';
import { ScreenScaffold } from '../../src/components/ScreenScaffold';
import { colors, radii } from '../../src/design/theme';
import { useLocale } from '../../src/i18n/LocaleContext';
import { claimOfflineDraftOwner, getOfflineDraft } from '../../src/offline/draft-store';

WebBrowser.maybeCompleteAuthSession();

export default function ProfileScreen() {
  const params = useLocalSearchParams<{ returnDraftId?: string | string[] }>();
  const router = useRouter();
  const returnDraftId = validatedReturnDraftId(params.returnDraftId);
  const { locale, setLocale, t } = useLocale();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const resumeReport = async () => resumeValidatedReportDraft(
    returnDraftId,
    async () => {
      const supabase = getSupabaseClient();
      if (!supabase) return null;
      const { data } = await supabase.auth.getSession();
      return data.session?.user.id ?? null;
    },
    async (draftId, ownerSubject) => {
      const draft = await getOfflineDraft(draftId);
      if (!draft) return false;
      if (draft.ownerSubject === ownerSubject) return true;
      if (draft.ownerSubject !== undefined || draft.report?.creatorMode !== 'anonymous') return false;
      if (!await claimOfflineDraftOwner(draftId, ownerSubject)) return false;
      return (await getOfflineDraft(draftId))?.ownerSubject === ownerSubject;
    },
    (path) => router.replace(path as never),
  );

  useEffect(() => {
    if (returnDraftId) void resumeReport();
    // The validated opaque ID is the only return intent carried across auth.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returnDraftId]);

  async function sendMagicLink() {
    let normalized: string;
    try {
      normalized = normalizeContributionEmail(email);
    } catch {
      setStatus('Enter a valid email address.');
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) {
      setStatus('Development auth is not configured. No email was sent.');
      return;
    }
    setSending(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: normalized,
      options: {
        emailRedirectTo: Linking.createURL('/auth/callback', returnDraftId ? { queryParams: { returnDraftId } } : undefined),
      },
    });
    setSending(false);
    setStatus(error ? error.message : 'Check your email for a secure sign-in link.');
  }

  async function confirmAdultContributor() {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setStatus('Development auth is not configured.');
      return;
    }
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (!user) {
      setStatus('Sign in before confirming contributor eligibility.');
      return;
    }
    const publicName = user.email?.split('@')[0] || 'Community contributor';
    const { error } = await supabase.from('user_profiles').upsert({
      id: user.id,
      public_name: publicName,
      locale,
      adult_confirmed_at: new Date().toISOString(),
    });
    setStatus(error ? error.message : '18+ contributor confirmation recorded.');
  }

  async function signInWithProvider(provider: 'apple' | 'google') {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setStatus('Development auth is not configured.');
      return;
    }

    setSending(true);
    try {
      const redirectTo = makeRedirectUri({ scheme: 'animalhelper', path: 'auth/callback' });
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: buildOAuthOptions(redirectTo),
      });
      if (error) throw error;

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type !== 'success') {
        setStatus('Sign-in was cancelled.');
        return;
      }
      const code = extractAuthCode(result.url);
      if (!code) throw new Error('missing_callback_code');
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) throw exchangeError;
      setStatus(`Signed in with ${provider === 'apple' ? 'Apple' : 'Google'}.`);
      await resumeReport();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Sign-in failed.');
    } finally {
      setSending(false);
    }
  }

  return (
    <ScreenScaffold title={t('profile.title')} subtitle={t('profile.subtitle')}>
      <View style={styles.card}>
        <Text style={styles.label}>Language / 语言</Text>
        <View style={styles.row}>
          <Pressable onPress={() => setLocale('en')} style={[styles.choice, locale === 'en' && styles.selected]}><Text>English</Text></Pressable>
          <Pressable onPress={() => setLocale('zh-CN')} style={[styles.choice, locale === 'zh-CN' && styles.selected]}><Text>简体中文</Text></Pressable>
        </View>
      </View>
      {returnDraftId ? <View style={styles.card}>
        <Text style={styles.label}>Saved report waiting</Text>
        <Text style={styles.value}>Sign in, then resume the same private draft. No report content is placed in this link.</Text>
        <Pressable accessibilityRole="button" onPress={() => { void resumeReport(); }} style={styles.primary}>
          <Text style={styles.primaryText}>Resume saved report</Text>
        </Pressable>
      </View> : null}
      <View style={styles.card}>
        <Text style={styles.label}>Email sign-in</Text>
        <Text style={styles.value}>Browsing stays anonymous. Sign in only when you want to contribute.</Text>
        <TextInput
          accessibilityLabel="Email address"
          autoCapitalize="none"
          autoComplete="email"
          inputMode="email"
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor={colors.muted}
          style={styles.input}
          value={email}
        />
        <Pressable accessibilityRole="button" disabled={sending} onPress={sendMagicLink} style={styles.primary}>
          <Text style={styles.primaryText}>{sending ? 'Sending…' : 'Send magic link'}</Text>
        </Pressable>
        <View style={styles.row}>
          <Pressable accessibilityRole="button" disabled={sending} onPress={() => signInWithProvider('apple')} style={styles.provider}>
            <Text style={styles.providerText}>Continue with Apple</Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={sending} onPress={() => signInWithProvider('google')} style={styles.provider}>
            <Text style={styles.providerText}>Continue with Google</Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.card}>
        <Text style={styles.label}>Contributor eligibility</Text>
        <Text style={styles.value}>Contributing requires confirmation that you are at least 18. Date of birth is not collected.</Text>
        <Pressable accessibilityRole="button" onPress={confirmAdultContributor} style={styles.choice}>
          <Text>I confirm I am 18 or older</Text>
        </Pressable>
      </View>
      <View style={styles.card}><Text style={styles.label}>AI training consent</Text><Text style={styles.value}>Off by default · separate, withdrawable opt-in will be requested before any training use.</Text></View>
      {status ? <Text accessibilityLiveRegion="polite" style={styles.status}>{status}</Text> : null}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  card: { padding: 18, borderRadius: radii.medium, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, gap: 10 },
  label: { color: colors.ink, fontWeight: '800', fontSize: 16 },
  value: { color: colors.muted, lineHeight: 21 },
  row: { flexDirection: 'row', gap: 10 },
  choice: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: radii.small, borderWidth: 1, borderColor: colors.line },
  selected: { backgroundColor: colors.leafSoft, borderColor: colors.leaf },
  input: { minHeight: 48, paddingHorizontal: 14, borderRadius: radii.small, borderWidth: 1, borderColor: colors.line, color: colors.ink },
  primary: { minHeight: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.leaf },
  primaryText: { color: '#FFFFFF', fontWeight: '800' },
  provider: { flexGrow: 1, minHeight: 44, paddingHorizontal: 12, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.ink },
  providerText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  status: { color: colors.muted, lineHeight: 20, textAlign: 'center' },
});
