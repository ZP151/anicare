import {Image,Pressable} from 'react-native';
import {useRouter} from 'expo-router';
import {useLocale} from '../i18n/LocaleContext';
import {ProfileAvatar} from '../profile/ProfileAvatar';
import {communitySampleAuthor} from './test-samples';
import {samplePersonForName,personText} from './sample-people';

const samplePhotos={
 woman:require('../../assets/test-samples/avatar-woman.jpg'),
 man:require('../../assets/test-samples/avatar-man.jpg'),
};

/** Only fixed synthetic fixtures use bundled fictional portraits. */
export function CommunityAuthorAvatar({id,avatarKey,photoUri,size=36,linkToProfile=true}:{id:string;avatarKey:unknown;photoUri?:string|null;size?:number;linkToProfile?:boolean}){
 const {locale}=useLocale(),router=useRouter();const sample=communitySampleAuthor(id,locale),person=sample?samplePersonForName(sample.name):null;
 const avatar=sample?.photo?<Image accessibilityLabel={locale==='zh-CN'?'合成测试邻居头像':'Synthetic test neighbour avatar'} source={samplePhotos[sample.photo]} style={{width:size,height:size,borderRadius:size/2}}/>:<ProfileAvatar avatarKey={sample?.avatarKey??avatarKey} photoUri={sample?undefined:photoUri} size={size}/>;
 return person&&linkToProfile?<Pressable accessibilityRole="button" accessibilityLabel={`${locale==='zh-CN'?'查看测试用户':'View sample profile'} ${personText(person.name,locale)}`} onPress={()=>router.push(`/community/people/${person.id}` as never)} style={{minWidth:44,minHeight:44,alignItems:'center',justifyContent:'center'}}>{avatar}</Pressable>:avatar;
}
