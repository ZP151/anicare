import { createSocialDraft, parseSocialDraft, editSocialDraft, freezeSocialDraft, type SocialImage } from './post-draft';

const owner = '00000000-0000-4000-8000-000000004001';
const id = '00000000-0000-4000-8000-000000004002';
const request = '00000000-0000-4000-8000-000000004003';
const now = '2026-09-11T00:00:00.000Z';
const image = (n: number): SocialImage => ({ id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, requestId: `00000000-0000-4000-8000-${String(n+100).padStart(12, '0')}`, thumb: {width: 320, height: 240, byteLength: 100, sha256:'a'.repeat(64)}, display: {width: 1280, height: 960, byteLength: 400, sha256:'b'.repeat(64)} });

it('round trips a partially filled owner-bound draft without manufacturing a report', () => {
  const draft = createSocialDraft(owner, id, request, now);
  expect(parseSocialDraft(JSON.parse(JSON.stringify(draft)), owner)).toEqual(draft);
  expect(draft).toMatchObject({phase:'editing', revision:0, body:'', images:[]});
  expect(() => parseSocialDraft(draft, request)).toThrow('social_draft_owner_mismatch');
  expect(() => parseSocialDraft({...draft,schemaVersion:2},owner)).toThrow('invalid_social_draft');
});

it('preserves cover order and completed media identities across recovery', () => {
  const first = {...image(1), mediaId:request, upload:{jobId:request,expiresAt:now}};
  const draft = editSocialDraft(createSocialDraft(owner,id,request,now), {body:'A cat by the garden', communitySlug:'sg-clsz05',images:[image(2),first]}, now);
  const restored = parseSocialDraft(JSON.parse(JSON.stringify(draft)), owner);
  expect(restored.images.map(item=>item.id)).toEqual([image(2).id,first.id]);
  expect(restored.images[1]?.mediaId).toBe(request);
  expect(restored.requestId).toBe(request);
});

it('rejects over-limit, duplicate, malformed or unsafe image metadata', () => {
  const draft = createSocialDraft(owner,id,request,now);
  for(const images of [Array.from({length:7},(_,n)=>image(n+1)),[image(1),image(1)],[{...image(1),display:{...image(1).display,width:4096}}],[{...image(1),thumb:{...image(1).thumb,byteLength:600000}}]]) {
    expect(()=>parseSocialDraft({...draft,images},owner)).toThrow('invalid_social_draft');
  }
  expect(()=>parseSocialDraft({...draft,images:[{...image(1),sourceUri:'file:///private/photo.jpg'}]},owner)).toThrow('invalid_social_draft');
});

it('freezes the exact payload before publication can become uncertain', () => {
  const draft=editSocialDraft(createSocialDraft(owner,id,request,now),{body:'Mochi in the shade',communitySlug:'sg-clsz05',images:[{...image(1),mediaId:id}]},now);
  const frozen=freezeSocialDraft(draft,now);
  expect(frozen.phase).toBe('publishing');
  expect(freezeSocialDraft(frozen,now)).toEqual(frozen);
  expect(()=>editSocialDraft(frozen,{body:'A different caption'},now)).toThrow('social_publication_pending');
  expect(()=>freezeSocialDraft({...draft,images:[image(1)]},now)).toThrow('social_images_not_uploaded');
  expect(()=>freezeSocialDraft(createSocialDraft(owner,id,request,now),now)).toThrow('invalid_social_post');
});
