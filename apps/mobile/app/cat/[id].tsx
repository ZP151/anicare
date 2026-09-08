import * as Crypto from 'expo-crypto';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
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

const opaqueAnimalId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function CatRoute() {
  const { locale } = useLocale();
  const colors = useNativeColors();
  const styles = makeStyles(colors);
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const animalId = typeof id === 'string' ? id : null;
  const [cat, setCat] = useState<SelectedCatSummary | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [authEpoch, setAuthEpoch] = useState(0);
  const generation = useRef(0);
  useEffect(() => subscribeSessionSubject(() => {
    ++generation.current;
    setCat(null);
    setStatus('loading');
    setAuthEpoch((epoch) => epoch + 1);
  }), []);
  useEffect(() => {
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
        const presentations = await getCatPresentations([row.animalId]);
        if (!active || token !== generation.current) return;
        const presentation = presentations.get(row.animalId);
        if (presentation) setCat(current => current?.animalId === row.animalId ? {...current,...presentation} : current);
      })
      .catch(() => { if (active) setStatus('unavailable'); });
    return () => { active = false; ++generation.current; };
  }, [animalId, locale, authEpoch]);

  if (status === 'ready' && cat) {
    return <CatDetailScreen key={cat.animalId} cat={cat} fixture={false} locale={locale} onBack={() => router.back()} heroActions={<FollowControl compact key={cat.animalId} animalId={cat.animalId} />}
      onReportSighting={async (selectedAnimalId) => {
        const draftId = await createOwnerAwareReportDraft({
          readAuthSnapshot: async () => ({ ownerSubject: await readSessionSubjectStrict() }),
          saveDraft: saveOfflineDraft, createId: Crypto.randomUUID, now: () => new Date(),
        }, opaqueAnimalId.test(selectedAnimalId)
          ? { identityIntent: { kind: 'existing', animalId: selectedAnimalId } } : {});
        router.push({ pathname: '/report/new', params: { draftId } } as never);
      }} onRecordCare={(selectedAnimalId) => { router.push({ pathname: '/care/[id]', params: { id: selectedAnimalId } } as never); }} ><Pressable accessibilityRole="button" style={{minHeight:48,justifyContent:'center'}} onPress={()=>router.push(`/safety/${cat.animalId}` as never)}><Text style={{color:colors.ink}}>{locale==='zh-CN'?'内容安全与身份纠错':'Content safety and identity correction'}</Text></Pressable></CatDetailScreen>;
  }
  return <ScreenScaffold
    subtitle={locale === 'zh-CN' ? '公开档案仅显示可公开的身份摘要与粗略活动。' : 'Public profiles show eligible identity summaries and coarse activity.'}
    title={status === 'loading' ? (locale === 'zh-CN' ? '正在加载猫档案' : 'Loading cat profile') : (locale === 'zh-CN' ? '猫档案不可用' : 'Cat profile unavailable')}
    trailing={<Pressable accessibilityRole="button" accessibilityLabel={locale === 'zh-CN' ? '返回' : 'Back'} onPress={() => router.back()} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{color:colors.ink}}>{locale === 'zh-CN' ? '返回' : 'Back'}</Text></Pressable>}
  ><Text accessibilityLiveRegion="polite" style={styles.status}>
    {status === 'loading' ? (locale === 'zh-CN' ? '正在读取公开档案…' : 'Loading the public profile…')
      : (locale === 'zh-CN' ? '该档案当前不可公开访问。' : 'This profile is currently unavailable.')}
  </Text></ScreenScaffold>;
}
const makeStyles = (colors: ReturnType<typeof useNativeColors>) => StyleSheet.create({ status: { color: colors.muted, fontSize: 14, lineHeight: 21 } });
