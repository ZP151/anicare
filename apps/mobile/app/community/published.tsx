import { useLocalSearchParams } from 'expo-router';
import { PublicationResult } from '../../src/community/PublicationResult';
import { useLocale } from '../../src/i18n/LocaleContext';
export default function PublishedRoute() {
 const { postId } = useLocalSearchParams<{ postId?: string | string[] }>(), { locale } = useLocale();
 return <PublicationResult postId={typeof postId === 'string' ? postId : ''} locale={locale} />;
}
