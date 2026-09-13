export function validateFixtureActor(user:Record<string,any>|undefined,profile:Record<string,any>|undefined,identities:number,expected:{name:string;avatarKey:string},sessions=0){
 if(user && (user.raw_app_meta_data?.fixture!=='c1-samples-v2' || user.email || user.phone || user.encrypted_password || user.email_confirmed_at || user.phone_confirmed_at || user.last_sign_in_at || user.is_anonymous || identities>0 || sessions>0))throw new Error('test_sample_actor_collision');
 if(profile && (profile.public_name!==expected.name || profile.avatar_key!==expected.avatarKey || profile.adult_confirmed_at || profile.training_consent_at || profile.training_consent_withdrawn_at))throw new Error('test_sample_actor_collision');
}
