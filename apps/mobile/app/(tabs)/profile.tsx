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
import { useAccountSession } from '../../src/auth/use-account-session';
import { claimOfflineDraftOwner, getOfflineDraft } from '../../src/offline/draft-store';

WebBrowser.maybeCompleteAuthSession();

export default function ProfileScreen() {
  const params = useLocalSearchParams<{ returnDraftId?: string | string[] }>();
  const router = useRouter();
  const returnDraftId = validatedReturnDraftId(params.returnDraftId);
  const { locale, setLocale, t } = useLocale();
  const auth = useAccountSession();
  const cn = locale === 'zh-CN';
  const [adult, setAdult] = useState<boolean|null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setAdult(null); setStatus(null); setEmail(''); setLoggingOut(false);
    if (!auth.owner) return;
    const current = auth.pin(); let active = true;
    const client = getSupabaseClient();
    void Promise.resolve(client?.rpc('is_adult_contributor')).then(async result => {
      if (active && await current() && result && !result.error && typeof result.data === 'boolean') setAdult(result.data);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [auth.owner, auth.pin]);

  async function signOut() {
    if (!auth.owner || loggingOut) return;
    const current = auth.pin(); setLoggingOut(true); setStatus(null);
    try {
      if (!await current()) return;
      const client = getSupabaseClient(); if (!client) throw new Error('auth_unavailable');
      const {error} = await client.auth.signOut({scope:'local'}); if(error) throw error;
      // Owner-bound drafts, media cleanup references and care requests remain recoverable.
      if (await current()) await auth.reload();
    } catch {
      if (await current()) setStatus(cn ? '退出失败，当前账户仍处于登录状态。' : 'Could not sign out. Your session is still active.');
    } finally { if (await current()) setLoggingOut(false); }
  }

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
      setStatus(cn?'请输入有效邮箱。':'Enter a valid email address.');
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) {
      setStatus(cn?'登录服务尚未连接，未发送邮件。':'Sign-in is unavailable. No email was sent.');
      return;
    }
    setSending(true);
    try {
    const { error } = await supabase.auth.signInWithOtp({
      email: normalized,
      options: {
        emailRedirectTo: Linking.createURL('/auth/callback', returnDraftId ? { queryParams: { returnDraftId } } : undefined),
      },
    });
    setSending(false);
    setStatus(error ? (locale === 'zh-CN' ? '暂时无法发送登录链接。请重试。' : 'We could not send a sign-in link. Please try again.') : (locale === 'zh-CN' ? '请查看邮箱中的安全登录链接。' : 'Check your email for a secure sign-in link.'));
    } catch { setStatus(cn ? '暂时无法发送登录链接。请重试。' : 'We could not send a sign-in link. Please try again.'); } finally { setSending(false); }
  }

  async function confirmAdultContributor() {
    const profileCopy = locale === 'zh-CN'
      ? { unavailable: '开发环境尚未配置身份验证。', signIn: '请先登录，再确认贡献者资格。', failed: '暂时无法保存贡献者确认。请重试。', saved: '已记录 18 岁以上贡献者确认。', defaultName: '社区贡献者' }
      : { unavailable: 'Development auth is not configured.', signIn: 'Sign in before confirming contributor eligibility.', failed: 'We could not save contributor confirmation. Please try again.', saved: '18+ contributor confirmation recorded.', defaultName: 'Community contributor' };
    const supabase = getSupabaseClient();
    if (!supabase) {
      setStatus(profileCopy.unavailable);
      return;
    }
    const current = auth.pin();
    try {
    if (!await current()) return;
    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    const user = data.session?.user;
    if (!user) {
      setStatus(profileCopy.signIn);
      return;
    }
    const profiles = supabase.from('user_profiles');
    const { data: existing, error: lookupError } = await profiles.select('id, public_name').eq('id', user.id).maybeSingle();
    if (!await current()) return;
    if (lookupError) { setStatus(profileCopy.failed); return; }
    const confirmation = { locale, adult_confirmed_at: new Date().toISOString() };
    const { error } = existing
      ? await profiles.update(confirmation).eq('id', user.id)
      : await profiles.insert({ id: user.id, public_name: profileCopy.defaultName, ...confirmation });
    if (!await current()) return;
    setStatus(error ? profileCopy.failed : profileCopy.saved);
    if (!error) setAdult(true);
    } catch { if (await current()) setStatus(profileCopy.failed); }
  }

  async function signInWithProvider(provider: 'apple' | 'google') {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setStatus(cn?'登录服务尚未连接。':'Sign-in is unavailable.');
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
        setStatus(cn?'已取消登录。':'Sign-in was cancelled.');
        return;
      }
      const code = extractAuthCode(result.url);
      if (!code) throw new Error('missing_callback_code');
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) throw exchangeError;
      setStatus(cn?'登录完成。':'Sign-in complete.');
      await resumeReport();
    } catch (error) {
      setStatus(locale === 'zh-CN' ? '登录失败。请重试。' : 'Sign-in failed. Please try again.');
    } finally {
      setSending(false);
    }
  }

  return (
    <ScreenScaffold title={t('profile.title')} subtitle={t('profile.subtitle')}>
      <View style={styles.card}>
        <Text accessibilityLiveRegion="polite" style={styles.label}>{auth.owner === undefined ? (auth.failed ? (cn?'账户状态不可用':'Account state unavailable') : (cn?'正在读取账户…':'Loading account…')) : auth.owner ? (cn?'已登录':'Signed in') : (cn?'匿名浏览':'Browsing anonymously')}</Text>
        {auth.owner ? <><Text>{adult === null ? (cn?'贡献者状态尚未确认':'Contributor state not confirmed') : adult ? (cn?'已确认年满 18 岁':'18+ contributor confirmed') : (cn?'需要确认年满 18 岁':'18+ confirmation required')}</Text><Pressable accessibilityRole="button" disabled={loggingOut} onPress={()=>{void signOut();}} style={styles.choice}><Text>{cn?'退出登录':'Sign out'}</Text></Pressable><Text>{cn?'退出后，本账户待续办的草稿和照护请求保留在本机。':'Saved drafts and pending care remain on this device for this account.'}</Text></> : null}
        {auth.failed ? <Pressable accessibilityRole="button" style={styles.choice} onPress={()=>{void auth.reload();}}><Text>{cn?'重试账户状态':'Retry account state'}</Text></Pressable> : null}
      </View>
      <Pressable accessibilityRole="button" onPress={()=>router.push('/report' as never)} style={styles.choice}><Text>{cn?'我的报告与草稿':'My reports and drafts'}</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={() => router.push('/care/my-care' as never)} style={{ minHeight: 48, justifyContent: 'center' }}><Text>{locale === 'zh-CN' ? '我的照护记录' : 'My care records'}</Text></Pressable>
      <Pressable accessibilityRole="button" style={styles.choice} onPress={()=>router.push('/privacy' as never)}><Text>{cn?'隐私与请求':'Privacy and requests'}</Text></Pressable>
      <View style={styles.card}>
        <Text style={styles.label}>Language / 语言</Text>
        <View style={styles.row}>
          <Pressable accessibilityRole="button" onPress={() => setLocale('en')} style={[styles.choice, locale === 'en' && styles.selected]}><Text>English</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => setLocale('zh-CN')} style={[styles.choice, locale === 'zh-CN' && styles.selected]}><Text>简体中文</Text></Pressable>
        </View>
      </View>
      {returnDraftId ? <View style={styles.card}>
        <Text style={styles.label}>{t('profile.reportReturnTitle')}</Text>
        <Text style={styles.value}>{t('profile.reportReturnCopy')}</Text>
        <Pressable accessibilityLabel={t('profile.reportReturnAction')} accessibilityRole="button" onPress={() => { void resumeReport(); }} style={styles.primary}>
          <Text style={styles.primaryText}>{t('profile.reportReturnAction')}</Text>
        </Pressable>
      </View> : null}
      <View style={styles.card}>
        <Text style={styles.label}>{cn?'邮箱登录':'Email sign-in'}</Text>
        <Text style={styles.value}>{cn?'浏览无需登录，贡献时再登录。':'Browsing stays anonymous. Sign in only when you want to contribute.'}</Text>
        <TextInput
          accessibilityLabel={cn?'邮箱地址':'Email address'}
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
          <Text style={styles.primaryText}>{sending ? (cn?'正在发送…':'Sending…') : (cn?'发送登录链接':'Send magic link')}</Text>
        </Pressable>
        <View style={styles.row}>
          <Pressable accessibilityRole="button" disabled={sending} onPress={() => signInWithProvider('apple')} style={styles.provider}>
            <Text style={styles.providerText}>{cn?'使用 Apple 登录':'Continue with Apple'}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={sending} onPress={() => signInWithProvider('google')} style={styles.provider}>
            <Text style={styles.providerText}>{cn?'使用 Google 登录':'Continue with Google'}</Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.card}>
        <Text style={styles.label}>{cn?'贡献者资格':'Contributor eligibility'}</Text>
        <Text style={styles.value}>{cn?'贡献前需确认年满 18 岁，不收集出生日期。':'Contributing requires confirmation that you are at least 18. Date of birth is not collected.'}</Text>
        <Pressable accessibilityRole="button" disabled={!auth.owner} onPress={confirmAdultContributor} style={styles.choice}>
          <Text>{cn?'我确认已年满 18 岁':'I confirm I am 18 or older'}</Text>
        </Pressable>
      </View>
      <View style={styles.card}><Text style={styles.label}>{cn?'AI 训练同意':'AI training consent'}</Text><Text style={styles.value}>{cn?'默认关闭。用于训练前将另行请求可撤回的明确同意。':'Off by default · separate, withdrawable opt-in will be requested before any training use.'}</Text></View>
      {status ? <Text accessibilityLiveRegion="polite" style={styles.status}>{status}</Text> : null}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  card: { padding: 18, borderRadius: radii.medium, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, gap: 10 },
  label: { color: colors.ink, fontWeight: '800', fontSize: 16 },
  value: { color: colors.muted, lineHeight: 21 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  choice: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 10, borderRadius: radii.small, borderWidth: 1, borderColor: colors.line },
  selected: { backgroundColor: colors.leafSoft, borderColor: colors.leaf },
  input: { minHeight: 48, paddingHorizontal: 14, borderRadius: radii.small, borderWidth: 1, borderColor: colors.line, color: colors.ink },
  primary: { minHeight: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.leaf },
  primaryText: { color: '#FFFFFF', fontWeight: '800' },
  provider: { flexGrow: 1, minHeight: 44, paddingHorizontal: 12, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.ink },
  providerText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  status: { color: colors.muted, lineHeight: 20, textAlign: 'center' },
});
