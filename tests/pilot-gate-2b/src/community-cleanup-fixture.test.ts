import {describe,expect,it} from 'vitest';
import {communityCleanupFixture} from './community-cleanup-fixture.js';
describe('recoverable cleanup fixtures',()=>{
  it('recovers exact IDs while separating attempts and live/expired jobs',()=>{
    const a=communityCleanupFixture(123,1);expect(communityCleanupFixture(123,1)).toEqual(a);
    expect(new Set([a.expired,a.live,a.requestExpired,a.requestLive]).size).toBe(4);
    expect(communityCleanupFixture(123,2).expired).not.toBe(a.expired);
    expect(a.expired).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-8[a-f0-9]{3}-[a-f0-9]{12}$/);
  });
  it.each([0,-1,NaN,1.5])('rejects ambiguous workflow identity %s',run=>expect(()=>communityCleanupFixture(run,1)).toThrow());
});
