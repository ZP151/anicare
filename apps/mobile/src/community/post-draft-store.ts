import {createSocialDraftStore} from './post-draft-storage';
export const socialDraftStore=createSocialDraftStore(async()=>{throw new Error('encrypted_social_storage_unavailable');},async()=>{throw new Error('encrypted_social_storage_unavailable');});
