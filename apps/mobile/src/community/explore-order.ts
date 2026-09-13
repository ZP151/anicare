type ExploreItem = Readonly<{postId:string;catId:string|null;communitySlug:string|null}>;
/** Mix only the newly fetched page. Existing cards never jump as pagination loads,
 * and the server cursor still follows its original chronological page boundary. */
export function appendExplorePage<T extends ExploreItem>(previous:readonly T[],incoming:readonly T[]):T[]{
 const seen=new Set(previous.map(p=>p.postId));
 const remaining=incoming.filter(p=>{if(seen.has(p.postId))return false;seen.add(p.postId);return true;});
 const result=[...previous];
 const round=new Set<string>();
 const identity=(item:T)=>item.catId??item.postId;
 while(remaining.length){
  const last=result[result.length-1];
  const different=(item:T)=>!last?.catId||!item.catId||item.catId!==last.catId;
  if(remaining.every(p=>round.has(identity(p))))round.clear();
  let index=remaining.findIndex(p=>!round.has(identity(p))&&different(p)&&(!last||p.communitySlug!==last.communitySlug));
  if(index<0)index=remaining.findIndex(p=>!round.has(identity(p))&&different(p));
  if(index<0)index=remaining.findIndex(different);
  const chosen=remaining.splice(Math.max(0,index),1)[0]!;
  round.add(identity(chosen));result.push(chosen);
 }
 return result;
}
