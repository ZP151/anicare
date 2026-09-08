import { buildSingaporeAreas, filterSingaporeAreas } from './singapore-communities';
import type { PublicSighting } from '../api/feed';

const row:PublicSighting={sightingId:'00000000-0000-4000-8000-000000000001',animalId:'00000000-0000-4000-8000-000000000002',primaryAlias:'Mochi',verification:'reported',publicCellId:'896526add03ffff',timeBucket:'today',coverMediaId:null,cursor:'00000000-0000-4000-8000-000000000001'};
it('groups a real public cell into Tampines with a unique cat and public building context',()=>{
 const areas=buildSingaporeAreas([row,row],new Map([[row.sightingId,{residenceType:'hdb',residenceName:'Block 123 Test Street'}]]),'en');
 const area=areas.find(a=>a.id==='tampines')!;
 expect(area.cats).toHaveLength(1);
 expect(area.cats[0]).toMatchObject({alias:'Mochi',residenceName:'Block 123 Test Street'});
 expect(JSON.stringify(area.cats)).not.toContain(row.publicCellId);
 expect(filterSingaporeAreas(areas,'east','Mochi')).toHaveLength(1);
 expect(filterSingaporeAreas(areas,'north','Mochi')).toHaveLength(0);
 expect(filterSingaporeAreas(areas,'all','Block 123')).toHaveLength(1);
});
it('keeps areas with no cats browseable and does not guess an unsupported location',()=>{
 const areas=buildSingaporeAreas([{...row,publicCellId:'bad'}],new Map(),'en');
 expect(areas).toHaveLength(55);
 expect(areas.reduce((n,a)=>n+a.cats.length,0)).toBe(0);
});
