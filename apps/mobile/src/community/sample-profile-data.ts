import {getCommunityPost,type CommunityPost} from '../api/community';
import {COMMUNITY_TEST_POSTS} from './test-samples';
import {samplePerson} from './sample-people';

/** A fixed display persona is not an Auth identity. All content still needs a
 * successful public read; never fill a failed or hidden post from the catalogue. */
export async function loadSampleProfilePosts(personId:string,read=getCommunityPost):Promise<readonly CommunityPost[]> {
 const person=samplePerson(personId);
 if(!person)return [];
 const matches=COMMUNITY_TEST_POSTS.filter(post=>post.profile.name===person.fixtureName);
 const posts=await Promise.all(matches.map(async sample=>{
  try{return await read(sample.id);}catch(error){
   if(error instanceof Error&&error.message==='community_post_hidden')return null;
   throw error;
  }
 }));
 return posts.filter((post):post is CommunityPost=>post!==null).sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt));
}
