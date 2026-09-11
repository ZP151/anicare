export type PendingDirectMessage=Readonly<{owner:string;conversationId:string;body:string;requestId:string}>;
const unavailable=()=>{throw new Error('secure_offline_storage_unavailable');};
export async function savePendingDirectMessage(_item:PendingDirectMessage):Promise<void>{return unavailable();}
export async function listPendingDirectMessages(_owner:string):Promise<PendingDirectMessage[]>{return unavailable();}
export async function removePendingDirectMessage(_owner:string,_requestId:string):Promise<void>{return unavailable();}
