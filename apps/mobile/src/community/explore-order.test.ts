import {appendExplorePage} from './explore-order';
const post=(postId:string,catId:string|null,communitySlug='west')=>({postId,catId,communitySlug});
it('separates repeated cats and communities without dropping a story',()=>{
 const rows=[post('1','a'),post('2','a'),post('3','b','east'),post('4','b','east'),post('5','c','north')];
 const mixed=appendExplorePage([],rows);
 expect(mixed[0]).toBe(rows[0]);
 expect(mixed.map(p=>p.catId)).toEqual(['a','b','c','a','b']);
 expect(new Set(mixed.map(p=>p.postId))).toEqual(new Set(rows.map(p=>p.postId)));
});
it('preserves displayed order across pagination and removes overlapping IDs',()=>{
 const previous=[post('1','a'),post('2','b')];
 const mixed=appendExplorePage(previous,[post('2','b'),post('3','b'),post('4','c')]);
 expect(mixed.slice(0,2)).toEqual(previous);
 expect(mixed.map(p=>p.postId)).toEqual(['1','2','4','3']);
});
it('retains all single-cat and unlinked posts without inventing an identity',()=>{
 const rows=[post('1','a'),post('2','a'),post('3',null),post('4',null)];
 const mixed=appendExplorePage([],rows);
 expect(mixed).toHaveLength(4);expect(new Set(mixed)).toEqual(new Set(rows));
 expect(appendExplorePage([],[])).toEqual([]);
});
