import {readProviderSettings,exchangeAuthCodeOnce,type ProviderSettings} from '../../src/auth/provider-settings';
import {ProfilePosts} from '../../src/profile/ProfilePosts';
import appConfig from '../../app.json';
import { makeRedirectUri } from 'expo-auth-session';
import * as Linking from 'expo-linking';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { buildOAuthOptions, extractAuthCode, normalizeContributionEmail } from '../../src/api/auth';
import { resumeValidatedReportDraft, validatedReturnDraftId } from '../../src/auth/profile-report-return';
import { getSupabaseClient } from '../../src/api/supabase';
import { ScreenScaffold } from '../../src/components/ScreenScaffold';
import { AppIcon } from '../../src/components/AppIcon';
import { SettingsGroup, SettingsRow } from '../../src/components/SettingsGroup';
import { radii } from '../../src/design/theme';
import { InterfaceColors, useNativeColors } from '../../src/design/native-colors';
import { useLocale } from '../../src/i18n/LocaleContext';
import { useAccountSession } from '../../src/auth/use-account-session';
import { claimOfflineDraftOwner, getOfflineDraft } from '../../src/offline/draft-store';
import { PROFILE_AVATAR_EMOJI, PROFILE_AVATAR_KEYS, profileAvatarKey, type ProfileAvatarKey } from '../../src/profile/profile-avatar';
import { prepareAvatar, discardAvatar } from '../../src/media/processor';
import { uploadProfileAvatar } from '../../src/api/profile-avatar-upload';
import { ProfileAvatar } from '../../src/profile/ProfileAvatar';
import type { RenderedMedia } from '../../src/media/contracts';

WebBrowser.maybeCompleteAuthSession();

export default function ProfileScreen() {
  const colors = useNativeColors();
  const styles = makeStyles(colors);
  const params = useLocalSearchParams<{ returnDraftId?: string | string[] }>();
  const router = useRouter();
  const returnDraftId = validatedReturnDraftId(params.returnDraftId);
  const { locale, setLocale, t } = useLocale();
  const auth = useAccountSession();
  const cn = locale === 'zh-CN';
  const [publicName,setPublicName]=useState('');
  const [adult, setAdult] = useState<boolean|null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [showSignIn, setShowSignIn] = useState(false);
  const [providers,setProviders]=useState<ProviderSettings|null>(null);
  useEffect(()=>{if(!showSignIn)return;let active=true;setProviders(null);void readProviderSettings().then(value=>{if(active)setProviders(value);}).catch(()=>undefined);return()=>{active=false;};},[showSignIn]);
  const [showLanguage, setShowLanguage] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [nameExists, setNameExists] = useState(false);
  const [nameLoading, setNameLoading] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [avatarKey, setAvatarKey] = useState<ProfileAvatarKey>('person');
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [showAvatar, setShowAvatar] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [pendingAvatar, setPendingAvatar] = useState<RenderedMedia | null>(null);
  useEffect(() => () => { if (pendingAvatar) discardAvatar(pendingAvatar.uri); }, [pendingAvatar]);

  useEffect(() => {
    setPublicName(''); setAdult(null); setStatus(null); setEmail(''); setLoggingOut(false); setShowSignIn(false);
    setEditingName(false); setNameValue(''); setNameExists(false); setNameLoading(false); setSavingName(false); setAvatarKey('person'); setAvatarPath(null); setAvatarUri(null); setShowAvatar(false); setSavingAvatar(false); setPendingAvatar(null);
    if (!auth.owner) return;
    const current = auth.pin(); let active = true;
    const client = getSupabaseClient();
    void Promise.resolve(client?.rpc('is_adult_contributor')).then(async result => {
      if (active && await current() && result && !result.error && typeof result.data === 'boolean') setAdult(result.data);
    }).catch(() => undefined);
    void Promise.resolve(client?.from('user_profiles').select('avatar_key,avatar_object_path,public_name').eq('id', auth.owner).maybeSingle()).then(async result => {
      if (active && await current() && result && !result.error) {
        const path = typeof result.data?.avatar_object_path === 'string' ? result.data.avatar_object_path : null;
        setPublicName(typeof result.data?.public_name==='string'?result.data.public_name:'');
        setAvatarKey(profileAvatarKey(result.data?.avatar_key)); setAvatarPath(path);
        if (path && client) { const signed = await client.storage.from('profile-avatars').createSignedUrl(path, 60); if (active && await current() && !signed.error) setAvatarUri(signed.data?.signedUrl ?? null); }
      }
    }).catch(() => undefined);
    return () => { active = false; };
  }, [auth.owner, auth.pin]);

  async function saveAvatar(nextAvatar: ProfileAvatarKey) {
    if (!auth.owner || savingAvatar) return;
    const current = auth.pin(); setSavingAvatar(true); setStatus(null);
    try {
      const client = getSupabaseClient();
      if (!client || !await current()) throw new Error('profile_unavailable');
      const { data: existing, error: lookupError } = await client.from('user_profiles').select('id').eq('id', auth.owner).maybeSingle();
      if (lookupError) throw lookupError;
      const result = existing
        ? await client.rpc('set_profile_avatar_preset', { p_owner_id: auth.owner, p_avatar_key: nextAvatar })
        : await client.from('user_profiles').insert({ id: auth.owner, public_name: cn ? '社区贡献者' : 'Community contributor', locale, avatar_key: nextAvatar });
      if (!await current()) return;
      if (result.error) throw result.error;
      setAvatarKey(nextAvatar); setAvatarPath(null); setAvatarUri(null); setShowAvatar(false);
      setStatus(cn ? '头像已保存。' : 'Avatar saved.');
    } catch { if (await current()) setStatus(cn ? '无法保存头像，请重试。' : 'Could not save your avatar. Try again.'); }
    finally { if (await current()) setSavingAvatar(false); }
  }

  async function chooseAvatar(source: 'camera' | 'library') {
    if (!auth.owner || savingAvatar) return;
    const current = auth.pin(); setSavingAvatar(true); setStatus(null);
    try {
      const permission = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!await current()) return;
      if (!permission.granted) { setStatus(cn ? (source === 'camera' ? '请在系统设置中允许相机访问后重试。' : '请在系统设置中允许照片访问后重试。') : (source === 'camera' ? 'Allow camera access in Settings, then try again.' : 'Allow photo access in Settings, then try again.')); return; }
      const selected = await (source === 'camera' ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync)({ mediaTypes: ['images'], allowsEditing: false, exif: false, quality: 1 });
      if (!await current()) return;
      if (selected.canceled || !selected.assets[0]?.uri) return;
      // This decodes and re-rasterizes locally; the Edge function later accepts only the strict metadata-free JPEG profile.
      const artifact = await prepareAvatar(selected.assets[0].uri);
      if (!await current()) { discardAvatar(artifact.uri); return; }
      setPendingAvatar(artifact);
    } catch { if (await current()) setStatus(cn ? '无法准备照片头像，请重试。' : 'Could not prepare your photo. Try again.'); }
    finally { if (await current()) setSavingAvatar(false); }
  }

  async function savePhotoAvatar() {
    if (!pendingAvatar || !auth.owner || savingAvatar) return;
    const current=auth.pin(); setSavingAvatar(true); setStatus(null);
    try {
      await uploadProfileAvatar(pendingAvatar, undefined, current);
      if (!await current()) return;
      const client = getSupabaseClient();
      const profile = await client?.from('user_profiles').select('avatar_object_path').eq('id', auth.owner).maybeSingle();
      if (!await current()) return;
      const path = typeof profile?.data?.avatar_object_path === 'string' ? profile.data.avatar_object_path : null;
      setAvatarPath(path);
      if (path && client) { const signed = await client.storage.from('profile-avatars').createSignedUrl(path, 60); if (!await current()) return; setAvatarUri(!signed.error ? signed.data?.signedUrl ?? null : null); }
      setPendingAvatar(null); setShowAvatar(false); setStatus(cn ? '照片头像已保存。' : 'Photo avatar saved.');
    } catch { if (await current()) setStatus(cn ? '无法保存照片头像，请重试。' : 'Could not save your photo avatar. Try again.'); }
    finally { if (await current()) setSavingAvatar(false); }
  }

  async function editName() {
    if (!auth.owner) return;
    const current = auth.pin();
    setEditingName(true); setNameLoading(true); setStatus(null);
    try {
      const client = getSupabaseClient();
      if (!await current()) return;
      if (!client) throw new Error('profile_unavailable');
      const { data, error } = await client.from('user_profiles').select('public_name').eq('id', auth.owner).maybeSingle();
      if (!await current()) return;
      if (error) throw error;
      setNameExists(Boolean(data)); setNameValue(data?.public_name ?? '');
    } catch {
      if (await current()) { setEditingName(false); setStatus(cn ? '暂时无法读取昵称，请重试。' : 'Could not load your name. Try again.'); }
    } finally { if (await current()) setNameLoading(false); }
  }

  async function saveName() {
    const name = nameValue.trim();
    if (!auth.owner || savingName || nameLoading) return;
    if (Array.from(name).length < 1 || Array.from(name).length > 60) {
      setStatus(cn ? '昵称需为 1–60 个字符。' : 'Use 1–60 characters for your name.'); return;
    }
    const current = auth.pin(); setSavingName(true); setStatus(null);
    try {
      const client = getSupabaseClient();
      if (!await current()) return;
      if (!client) throw new Error('profile_unavailable');
      const result = nameExists
        ? await client.from('user_profiles').update({ public_name: name }).eq('id', auth.owner)
        : await client.from('user_profiles').insert({ id: auth.owner, public_name: name, locale });
      if (!await current()) return;
      if (result.error) throw result.error;
      setPublicName(name); setNameValue(name); setNameExists(true); setEditingName(false);
      setStatus(cn ? '昵称已保存。' : 'Name saved.');
    } catch { if (await current()) setStatus(cn ? '未能保存昵称，请重试。' : 'Could not save your name. Try again.'); }
    finally { if (await current()) setSavingName(false); }
  }

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
      const available=await readProviderSettings();
      setProviders(available);
      if(!available[provider]) {setStatus(cn?'此登录方式尚未开通，请使用邮箱登录。':'This sign-in method is not available yet. Please use email.');return;}
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
      await exchangeAuthCodeOnce(supabase, code);
      setStatus(cn?'登录完成。':'Sign-in complete.');
      await resumeReport();
    } catch (error) {
      setStatus(locale === 'zh-CN' ? '登录失败。请重试。' : 'Sign-in failed. Please try again.');
    } finally {
      setSending(false);
    }
  }

  const [showSettings,setShowSettings]=useState(false);
  return (
    <ScreenScaffold compact title={cn?'我的':'Me'} nativeAppearance header={<View style={{flexDirection:'row',alignItems:'center',minHeight:44}}>{showSettings?<Pressable accessibilityRole="button" accessibilityLabel={cn?'返回个人页':'Back to profile'} onPress={()=>setShowSettings(false)} style={styles.close}><AppIcon name="back" color={colors.ink}/></Pressable>:null}<Text style={{flex:1,color:colors.ink,fontSize:20,fontWeight:'700'}}>{showSettings?(cn?'设置':'Settings'):(cn?'我的':'Me')}</Text>{!showSettings?<Pressable accessibilityRole="button" accessibilityLabel={cn?'设置':'Settings'} onPress={()=>setShowSettings(true)} style={styles.close}><AppIcon name="settings" size={21} color={colors.ink}/></Pressable>:null}</View>}>
      <View style={styles.account}>
        <View style={styles.avatar}><ProfileAvatar avatarKey={avatarKey} photoUri={avatarPath ? avatarUri : null} size={72} /></View>
        <View style={styles.accountCopy}>
        {auth.owner&&publicName?<Text style={styles.label}>{publicName}</Text>:null}
        <Text accessibilityLiveRegion="polite" style={styles.label}>{auth.owner === undefined ? (auth.failed ? (cn?'账户状态不可用':'Account state unavailable') : (cn?'正在读取账户…':'Loading account…')) : auth.owner ? (cn?'已登录':'Signed in') : (cn?'匿名浏览':'Browsing anonymously')}</Text>
        {auth.owner ? <Text style={styles.value}>{adult === null ? (cn?'贡献者状态尚未确认':'Contributor state not confirmed') : adult ? (cn?'已确认年满 18 岁':'18+ contributor confirmed') : (cn?'需要确认年满 18 岁':'18+ confirmation required')}</Text> : <Text style={styles.value}>{cn ? '一起记录社区猫的日常' : 'A little care, shared with your community.'}</Text>}
        {auth.owner === null && !showSignIn ? <Pressable accessibilityRole="button" onPress={() => setShowSignIn(true)} style={styles.signIn}><Text style={styles.linkText}>{cn ? '登录' : 'Sign in'}</Text><AppIcon name="chevron" size={13} color={colors.actionPrimary} /></Pressable> : null}
        {auth.failed ? <Pressable accessibilityRole="button" style={styles.choice} onPress={()=>{void auth.reload();}}><Text>{cn?'重试账户状态':'Retry account state'}</Text></Pressable> : null}
        </View>
      </View>
      {auth.owner&&!showSettings?<Pressable accessibilityRole="button" onPress={()=>setShowSettings(true)} style={[styles.choice,{alignSelf:'flex-start',minHeight:36,paddingVertical:4}]}><Text style={{fontSize:13,color:colors.ink}}>{cn?'编辑个人资料':'Edit profile'}</Text></Pressable>:null}
      {returnDraftId ? <View style={styles.card}>
        <Text style={styles.label}>{t('profile.reportReturnTitle')}</Text>
        <Text style={styles.value}>{t('profile.reportReturnCopy')}</Text>
        <Pressable accessibilityLabel={t('profile.reportReturnAction')} accessibilityRole="button" onPress={() => { void resumeReport(); }} style={styles.primary}>
          <Text style={styles.primaryText}>{t('profile.reportReturnAction')}</Text>
        </Pressable>
      </View> : null}
      <Modal visible={auth.owner === null && showSignIn} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { setShowSignIn(false); setEmail(''); setStatus(null); }}><ScreenScaffold title={cn?'登录':'Sign in'} nativeAppearance>
      <View style={styles.card}>
        <View style={styles.formHeading}><Text style={styles.label}>{cn?'欢迎回来':'Welcome back'}</Text><Pressable accessibilityRole="button" accessibilityLabel={cn ? '关闭登录' : 'Close sign-in'} onPress={() => { setShowSignIn(false); setEmail(''); setStatus(null); }} style={styles.close}><AppIcon name="close" color={colors.muted} size={18} /></Pressable></View>
        <Text style={styles.value}>{cn?'浏览无需登录，贡献时再登录。':'Browsing stays anonymous. Sign in only when you want to contribute.'}</Text>
        <TextInput
          accessibilityLabel={cn?'邮箱地址':'Email address'}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
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
          <Pressable accessibilityRole="button" disabled={sending || providers?.apple === false} onPress={() => signInWithProvider('apple')} style={styles.provider}>
            <AppIcon name="apple" size={18} color="#FFFFFF" />
            <Text style={styles.providerText}>{providers?.apple===false?(cn?'Apple · 尚未开通':'Apple · Coming later'):(cn?'使用 Apple 登录':'Continue with Apple')}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={sending || providers?.google === false} onPress={() => signInWithProvider('google')} style={styles.provider}>
            <AppIcon name="google" size={18} color="#FFFFFF" />
            <Text style={styles.providerText}>{providers?.google===false?(cn?'Google · 尚未开通':'Google · Coming later'):(cn?'使用 Google 登录':'Continue with Google')}</Text>
          </Pressable>
        </View>
        {status ? <Text accessibilityLiveRegion="polite" style={styles.status}>{status}</Text> : null}
      </View></ScreenScaffold></Modal>
      {!showSettings?<>
       <View style={{flexDirection:'row',paddingVertical:8,borderBottomWidth:StyleSheet.hairlineWidth,borderColor:colors.line}}>{([
        ['reports',cn?'报告':'Reports','/report'],['cat',cn?'关注':'Following','/following'],['reports',cn?'草稿':'Drafts','/community/drafts']
       ] as const).map(([icon,label,path])=><Pressable key={path} accessibilityRole="button" onPress={()=>router.push(path as never)} style={{flex:1,alignItems:'center',justifyContent:'center',minHeight:56,gap:6}}><AppIcon name={icon} size={20} color={colors.ink}/><Text style={{fontSize:12,color:colors.ink}}>{label}</Text></Pressable>)}</View>
       {auth.owner&&adult===false?<Pressable accessibilityRole="button" onPress={confirmAdultContributor} style={styles.choice}><Text style={styles.choiceText}>{cn?'我确认已年满 18 岁':'I confirm I am 18 or older'}</Text></Pressable>:null}
       {status&&!showSignIn?<Text accessibilityLiveRegion="polite" style={styles.status}>{status}</Text>:null}
       {auth.owner?<ProfilePosts owner={auth.owner} pin={auth.pin}/>:null}
      </>:null}
      {showSettings?<>
      <SettingsGroup title={cn ? '我的记录' : 'Your activity'}>
        <SettingsRow title={cn?'我的报告与草稿':'My reports and drafts'} icon="reports" onPress={() => router.push('/report' as never)} />
        <SettingsRow title={cn?'我的帖子':'My posts'} icon="community" onPress={() => router.push('/community/mine' as never)} />
        <SettingsRow title={cn?'帖子草稿':'Post drafts'} icon="reports" onPress={() => router.push('/community/drafts' as never)} />
        <SettingsRow title={cn?'我的照护记录':'My care records'} icon="care" onPress={() => router.push('/care/my-care' as never)} />
        <SettingsRow title={cn?'关注的猫':'Following'} icon="cat" last onPress={() => router.push('/following' as never)} />
      </SettingsGroup>
      <SettingsGroup title={cn ? '偏好与隐私' : 'Preferences & privacy'}>
        <SettingsRow title={cn?'语言':'Language'} icon="language" value={cn ? '简体中文' : 'English'} onPress={() => setShowLanguage(!showLanguage)} />
        <Modal visible={showLanguage} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowLanguage(false)}><ScreenScaffold title={cn?'语言':'Language'} nativeAppearance><Pressable accessibilityRole="button" accessibilityLabel={cn?'关闭':'Close'} onPress={()=>setShowLanguage(false)} style={styles.sheetClose}><Text style={styles.linkText}>{cn?'关闭':'Close'}</Text></Pressable><View style={styles.languageChoices}>{(['en', 'zh-CN'] as const).map(language => <Pressable key={language} accessibilityRole="radio" accessibilityState={{ checked: locale === language }} onPress={() => { setLocale(language); setShowLanguage(false); }} style={styles.languageChoice}><Text style={styles.choiceText}>{language === 'en' ? 'English' : '简体中文'}</Text>{locale === language ? <AppIcon name="check" color={colors.actionPrimary} size={18} /> : null}</Pressable>)}</View></ScreenScaffold></Modal>
        <SettingsRow title={cn?'隐私与请求':'Privacy and requests'} icon="privacy" last onPress={() => router.push('/privacy' as never)} />
      </SettingsGroup>
      {auth.owner && adult === false ? <View style={styles.card}>
        <Text style={styles.value}>{cn?'贡献前需确认年满 18 岁，不收集出生日期。':'Contributing requires confirmation that you are at least 18. Date of birth is not collected.'}</Text>
        <Pressable accessibilityRole="button" disabled={!auth.owner} onPress={confirmAdultContributor} style={styles.choice}>
          <Text style={styles.choiceText}>{cn?'我确认已年满 18 岁':'I confirm I am 18 or older'}</Text>
        </Pressable>
      </View> : null}
      {auth.owner ? <SettingsGroup title={cn ? '账户' : 'Account'}>
        <SettingsRow title={cn ? '头像' : 'Avatar'} icon="account" onPress={() => setShowAvatar(true)} />
        <Modal visible={showAvatar} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { setPendingAvatar(null); setShowAvatar(false); }}><ScreenScaffold title={cn ? '选择头像' : 'Choose avatar'} nativeAppearance><View style={styles.avatarChoices}><View style={styles.avatarPhotoActions}><Pressable accessibilityRole="button" disabled={savingAvatar} onPress={() => { void chooseAvatar('camera'); }} style={styles.choice}><Text style={styles.choiceText}>{cn ? '拍照' : 'Take photo'}</Text></Pressable><Pressable accessibilityRole="button" disabled={savingAvatar} onPress={() => { void chooseAvatar('library'); }} style={styles.choice}><Text style={styles.choiceText}>{cn ? '从相册选择' : 'Choose from library'}</Text></Pressable></View>{pendingAvatar ? <View style={styles.photoReview}><ProfileAvatar avatarKey={avatarKey} photoUri={pendingAvatar.uri} size={128}/><Pressable accessibilityRole="button" disabled={savingAvatar} onPress={() => { void savePhotoAvatar(); }} style={styles.primary}><Text style={styles.primaryText}>{savingAvatar ? (cn?'正在保存…':'Saving…') : (cn?'保存照片头像':'Save photo avatar')}</Text></Pressable><Pressable accessibilityRole="button" disabled={savingAvatar} onPress={()=>setPendingAvatar(null)} style={styles.choice}><Text style={styles.choiceText}>{cn?'取消':'Cancel'}</Text></Pressable></View> : null}<View style={styles.avatarGrid}>{PROFILE_AVATAR_KEYS.map((key) => <Pressable key={key} accessibilityRole="radio" accessibilityState={{ checked: avatarKey === key, disabled: savingAvatar }} disabled={savingAvatar} onPress={() => { void saveAvatar(key); }} style={[styles.avatarTile, avatarKey === key && styles.selected]}><Text style={styles.avatarOptionEmoji}>{PROFILE_AVATAR_EMOJI[key]}</Text><Text style={styles.tileLabel}>{key === 'person' ? (cn ? '默认' : 'Default') : key.startsWith('human-') ? key.slice(-2) : key}</Text></Pressable>)}</View>{status?<Text accessibilityLiveRegion="polite" style={styles.status}>{status}</Text>:null}</View></ScreenScaffold></Modal>
        <SettingsRow title={cn ? '昵称' : 'Display name'} icon="account" value={!editingName && nameValue ? nameValue : undefined} onPress={() => { void editName(); }} />
        {editingName ? <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditingName(false)}><ScreenScaffold title={cn?'编辑个人资料':'Edit profile'} nativeAppearance><View style={styles.nameForm}>
          <Pressable accessibilityRole="button" accessibilityLabel={cn?'关闭编辑':'Close edit'} onPress={() => setEditingName(false)} style={styles.close}><AppIcon name="close" color={colors.muted} size={18} /></Pressable>
          <TextInput accessibilityLabel={cn ? '公开昵称' : 'Public display name'} value={nameValue} onChangeText={setNameValue} editable={!nameLoading && !savingName} maxLength={120} style={styles.input} placeholder={cn ? '你的公开昵称' : 'Your public display name'} placeholderTextColor={colors.muted} />
          <Text style={styles.value}>{cn ? '这是公开昵称，请勿填写手机号或住址。' : 'This name may be public. Leave out contact details.'}</Text>
          <Pressable accessibilityRole="button" disabled={nameLoading || savingName} onPress={() => { void saveName(); }} style={styles.primary}><Text style={styles.primaryText}>{nameLoading ? (cn ? '正在读取…' : 'Loading…') : savingName ? (cn ? '正在保存…' : 'Saving…') : (cn ? '保存昵称' : 'Save name')}</Text></Pressable>
          {status ? <Text accessibilityLiveRegion="polite" style={styles.status}>{status}</Text> : null}
        </View></ScreenScaffold></Modal> : null}
        <SettingsRow title={cn?'退出登录':'Sign out'} icon="signout" destructive last disabled={loggingOut} onPress={() => { void signOut(); }} />
      </SettingsGroup> : null}
      <Text style={styles.status}>Whisker Commons {appConfig.expo.version} ({appConfig.expo.ios.buildNumber})</Text>
      {status && !showSignIn && !editingName ? <Text accessibilityLiveRegion="polite" style={styles.status}>{status}</Text> : null}
      </>:null}
    </ScreenScaffold>
  );
}

const makeStyles = (colors: InterfaceColors) => StyleSheet.create({
  account: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 12 },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.leafSoft, alignItems: 'center', justifyContent: 'center' },
  accountCopy: { flex: 1, gap: 6 },
  card: { padding: 18, borderRadius: 16, backgroundColor: colors.surface, gap: 14 },
  label: { color: colors.ink, fontWeight: '600', fontSize: 18, lineHeight: 24 },
  value: { color: colors.muted, fontSize: 15, lineHeight: 21 },
  formHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  close: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  sheetClose: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: 10 },
  signIn: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, alignSelf: 'flex-start' },
  linkText: { color: colors.actionPrimary, fontSize: 17, fontWeight: '600' },
  languageChoices: { paddingLeft: 52, paddingRight: 16 },
  avatarChoices: { paddingHorizontal: 16, gap: 10 },
  avatarPhotoActions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  photoReview: { alignItems: 'center', gap: 10, paddingVertical: 8 },
  avatarGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  avatarTile: { width: '30%', minHeight: 76, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  tileLabel: { color: colors.ink, fontSize: 12 },
  avatarOptionEmoji: { fontSize: 28, width: 34, textAlign: 'center' },
  avatarChoice: { minHeight: 56, paddingHorizontal: 14, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.surface },
  avatarChoiceCheck: { marginLeft: 'auto', width: 24, alignItems: 'center' },
  nameForm: { padding: 16, gap: 12 },
  languageChoice: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  choiceText: { color: colors.ink, fontSize: 17 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  choice: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 10, borderRadius: radii.small, borderWidth: 1, borderColor: colors.line },
  selected: { backgroundColor: colors.leafSoft, borderColor: colors.leaf },
  input: { minHeight: 48, paddingHorizontal: 14, borderRadius: radii.small, borderWidth: 1, borderColor: colors.line, color: colors.ink },
  primary: { minHeight: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.leaf },
  primaryText: { color: colors.onAction, fontWeight: '800' },
  provider: { flexGrow: 1, flexDirection: 'row', gap: 8, minHeight: 48, paddingHorizontal: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1C1C1E', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  providerText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  status: { color: colors.muted, lineHeight: 20, textAlign: 'center' },
});
