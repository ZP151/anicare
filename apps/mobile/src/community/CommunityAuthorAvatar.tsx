import {Image} from 'react-native';
import {useLocale} from '../i18n/LocaleContext';
import {ProfileAvatar} from '../profile/ProfileAvatar';
import {communitySampleAuthor} from './test-samples';

const samplePhotos={
 woman:require('../../assets/test-samples/avatar-woman.jpg'),
 man:require('../../assets/test-samples/avatar-man.jpg'),
};

/** Only fixed synthetic fixtures use bundled fictional portraits. */
export function CommunityAuthorAvatar({id,avatarKey,photoUri,size=36}:{id:string;avatarKey:unknown;photoUri?:string|null;size?:number}){
 const {locale}=useLocale();const sample=communitySampleAuthor(id,locale);
 if(sample?.photo)return <Image accessibilityLabel={locale==='zh-CN'?'合成测试邻居头像':'Synthetic test neighbour avatar'} source={samplePhotos[sample.photo]} style={{width:size,height:size,borderRadius:size/2}}/>;
 return <ProfileAvatar avatarKey={sample?.avatarKey??avatarKey} photoUri={sample?undefined:photoUri} size={size}/>;
}
