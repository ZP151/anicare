import {installEncryptedTransactions} from './encrypted-transactions';

function fixture(fail?:string){
 const events:string[]=[];let keyed=false;
 const connection={execAsync:jest.fn(async(sql:string)=>{
  events.push(sql);
  if(sql.startsWith('PRAGMA key')){if(fail==='key')throw new Error('key unavailable');keyed=true;}
  if(sql==='BEGIN IMMEDIATE'&&!keyed)throw new Error('file is not a database');
 }),closeAsync:jest.fn(async()=>{events.push('close');})};
 const database={withExclusiveTransactionAsync:async(job:(tx:typeof connection)=>Promise<void>)=>{await connection.execAsync('BEGIN IMMEDIATE');await job(connection);}};
 return {events,connection,database};
}
it('keys each new transaction connection before beginning, preserving foreign keys and isolation',async()=>{
 const f=fixture(),open=jest.fn(async()=>f.connection);
 installEncryptedTransactions(f.database,'a'.repeat(64),open);
 await f.database.withExclusiveTransactionAsync(async tx=>{expect(tx).toBe(f.connection);f.events.push('write');});
 expect(f.events).toEqual([`PRAGMA key = "x'${'a'.repeat(64)}'";`,'PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;','BEGIN IMMEDIATE','write','COMMIT','close']);
 expect(open).toHaveBeenCalledTimes(1);
});
it('closes an unkeyable connection without running a write or beginning a transaction',async()=>{
 const f=fixture('key'),write=jest.fn();installEncryptedTransactions(f.database,'a'.repeat(64),async()=>f.connection);
 await expect(f.database.withExclusiveTransactionAsync(write)).rejects.toThrow('key unavailable');
 expect(write).not.toHaveBeenCalled();expect(f.events).not.toContain('BEGIN IMMEDIATE');expect(f.connection.closeAsync).toHaveBeenCalledTimes(1);
});
it('rolls back failed work and preserves its error even if rollback fails',async()=>{
 const f=fixture();installEncryptedTransactions(f.database,'a'.repeat(64),async()=>f.connection);
 const original=f.connection.execAsync.getMockImplementation()!;
 f.connection.execAsync.mockImplementation(async sql=>{await original(sql);if(sql==='ROLLBACK')throw new Error('rollback failed');});
 await expect(f.database.withExclusiveTransactionAsync(async()=>{throw new Error('write failed');})).rejects.toThrow('write failed');
 expect(f.events).toContain('ROLLBACK');expect(f.events).not.toContain('COMMIT');expect(f.connection.closeAsync).toHaveBeenCalledTimes(1);
});
