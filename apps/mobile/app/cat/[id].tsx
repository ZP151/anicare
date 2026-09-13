import { CatStoryList } from '../../src/cat-story/CatStoryList';
import {BackButton} from '../../src/components/BackButton';
import * as Crypto from 'expo-crypto';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { FollowControl } from '../../src/following/FollowControl';
import { getPublicCatSummary } from '../../src/api/cats';
import { getCatPresentations } from '../../src/api/cat-presentation';
import { readSessionSubjectStrict, subscribeSessionSubject } from '../../src/auth/session-subject';
import { CatDetailScreen } from '../../src/components/CatDetailScreen';
import type { SelectedCatSummary } from '../../src/components/AnchoredCatSheet';
import { ScreenScaffold } from '../../src/components/ScreenScaffold';
import { useNativeColors } from '../../src/design/native-colors';
import { useLocale } from '../../src/i18n/LocaleContext';
import { getCommunityMapCopy } from '../../src/i18n/catalog';
import { saveOfflineDraft } from '../../src/offline/draft-store';
import { createOwnerAwareReportDraft } from '../../src/report/report-draft-factory';
import { CatCommunityContext } from '../../src/maps/CatCommunityContext';

const opaqueAnimalId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function CatRoute() {
  "use no memo"; // Auth epochs deliberately invalidate focus work; Expo compiler prunes deps-only epochs.
  const { locale } = useLocale();
  const colors = useNativeColors();
  const styles = makeStyles(colors);
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const animalId = typeof id === 'string' ? id : null;
  const [cat, setCat] = useState<SelectedCatSummary | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable' | 'error'>('loading');
  const [authEpoch, setAuthEpoch] = useState(0);
  const generation = useRef(0);
  useEffect(() => subscribeSessionSubject(() => {
    ++generation.current;
    setCat(null);
    setStatus('loading');
    setAuthEpoch((epoch) => epoch + 1);
  }), []);
  useFocusEffect(useCallback(() => {
    setCat(null);
    setStatus('loading');
    if (!animalId || !opaqueAnimalId.test(animalId)) { setStatus('unavailable'); return; }
    let active = true;
    const token = ++generation.current;
    void getPublicCatSummary(animalId)
      .then(async (row) => {
        if (!active || token !== generation.current) return;
        if (!row) { setStatus('unavailable'); return; }
        const copy = getCommunityMapCopy(locale);
        setCat({
          animalId: row.animalId, primaryAlias: row.primaryAlias,
          verificationLabel: copy.verificationLabel(row.verification),
          timeLabel: row.timeBucket ? copy.timeLabel(row.timeBucket)
            : locale === 'zh-CN' ? '暂无公开活动' : 'No public activity yet',
        });
        setStatus('ready');
        const presentations = await getCatPresentations([row.animalId]).catch(() => new Map());
        if (!active || token !== generation.current) return;
        const presentation = presentations.get(row.animalId);
        if (presentation) setCat(current => current?.animalId === row.animalId ? {...current,...presentation} : current);
      })
      .catch(() => { if (active && token === generation.current) setStatus('error'); });
    return () => { active = false; ++generation.current; };
  }, [animalId, locale, authEpoch]));

  if (status === 'ready' && cat) {
    return <CatDetailScreen key={cat.animalId} cat={cat} fixture={false} locale={locale} stories={<CatStoryList catId={cat.animalId} locale={locale}/>} onShareStory={id=>router.push(`/community/new?catId=${id}` as never)} onBack={() => router.canGoBack() ? router.back() : router.replace('/')} heroActions={<FollowControl compact key={cat.animalId} animalId={cat.animalId} />}
      onReportSighting={async (selectedAnimalId) => {
        const draftId = await createOwnerAwareReportDraft({
          readAuthSnapshot: async () => ({ ownerSubject: await readSessionSubjectStrict() }),
          saveDraft: saveOfflineDraft, createId: Crypto.randomUUID, now: () => new Date(),
        }, opaqueAnimalId.test(selectedAnimalId)
          ? { identityIntent: { kind: 'existing', animalId: selectedAnimalId } } : {});
        router.push({ pathname: '/report/new', params: { draftId } } as never);
      }} onRecordCare={(selectedAnimalId) => { router.push({ pathname: '/care/[id]', params: { id: selectedAnimalId } } as never); }} ><CatCommunityContext animalId={cat.animalId} locale={locale} showDiscussion={false}/><Pressable accessibilityRole="button" style={{minHeight:48,justifyContent:'center'}} onPress={()=>router.push(`/safety/${cat.animalId}` as never)}><Text style={{color:colors.ink}}>{locale==='zh-CN'?'内容安全与身份纠错':'Content safety and identity correction'}</Text></Pressable></CatDetailScreen>;
  }
  return <ScreenScaffold

    title={status === 'loading' ? (locale === 'zh-CN' ? '正在加载猫档案' : 'Loading cat profile') : status === 'error' ? (locale === 'zh-CN' ? '暂时无法加载' : 'Could not load profile') : (locale === 'zh-CN' ? '猫档案不可用' : 'Cat profile unavailable')}
    leading={<BackButton onPress={() => router.canGoBack() ? router.back() : router.replace('/')}/>}
  ><Text accessibilityLiveRegion="polite" style={styles.status}>
    {status === 'loading' ? (locale === 'zh-CN' ? '正在读取公开档案…' : 'Loading the public profile…')
      : status === 'error' ? (locale === 'zh-CN' ? '请检查网络连接，然后重试。' : 'Check your connection and try again.') : (locale === 'zh-CN' ? '该档案当前不可公开访问。' : 'This profile is currently unavailable.')}
  </Text>{status !== 'loading' && animalId && opaqueAnimalId.test(animalId) ? <Pressable accessibilityRole="button" onPress={() => setAuthEpoch(epoch => epoch + 1)} style={{minHeight:48,justifyContent:'center'}}><Text style={{color:colors.actionPrimary}}>{locale === 'zh-CN' ? '重试' : 'Retry'}</Text></Pressable> : null}</ScreenScaffold>;
}
const makeStyles = (colors: ReturnType<typeof useNativeColors>) => StyleSheet.create({ status: { color: colors.muted, fontSize: 14, lineHeight: 21 } });
