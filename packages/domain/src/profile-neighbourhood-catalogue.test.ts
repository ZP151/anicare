import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {singaporeCommunities} from './singapore-geography.js';
import {singaporeNeighbourhoods} from './singapore-neighbourhoods.js';
describe('profile neighbourhood database/client contract',()=>{
 it('allows exactly the stable area IDs selectable in the app',()=>{
  const sql=readFileSync(new URL('../../../supabase/migrations/202609130020_profile_photos_neighbourhood.sql',import.meta.url),'utf8');
  const ids=[...sql.matchAll(/^ \('([a-z0-9-]+)'\)/gm)].map(match=>match[1]);
  expect(ids.sort()).toEqual([...singaporeCommunities,...singaporeNeighbourhoods].map(area=>area.id).sort());
 });
});
