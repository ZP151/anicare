type Connection = {execAsync(sql:string):Promise<void>;closeAsync():Promise<void>};
export function installEncryptedTransactions<T extends Connection>(
 database:{withExclusiveTransactionAsync(job:(tx:T)=>Promise<void>):Promise<void>},
 key:string,openConnection:()=>Promise<T>,
):void {
 if(!/^[0-9a-f]{64}$/i.test(key))throw new Error('secure_offline_storage_key_invalid');
 // Expo's exclusive transaction opens a fresh, unkeyed connection. Key our
 // dedicated connection before BEGIN or any schema access; retain isolation.
 database.withExclusiveTransactionAsync=async job=>{
  const tx=await openConnection();let began=false,failed=false;
  try{
   await tx.execAsync(`PRAGMA key = "x'${key}'";`);
   await tx.execAsync('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
   await tx.execAsync('BEGIN IMMEDIATE');began=true;
   await job(tx);
   await tx.execAsync('COMMIT');began=false;
  }catch(error){
   failed=true;
   if(began){try{await tx.execAsync('ROLLBACK');}catch{/* Preserve the originating failure. */}}
   throw error;
  }finally{
   try{await tx.closeAsync();}catch(error){if(!failed)throw error;}
  }
 };
}
