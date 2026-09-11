export type PendingDirectMessage=Readonly<{owner:string;conversationId:string;body:string;requestId:string}>;
export function savePendingDirectMessage(item:PendingDirectMessage):Promise<void>;
export function listPendingDirectMessages(owner:string):Promise<PendingDirectMessage[]>;
export function removePendingDirectMessage(owner:string,requestId:string):Promise<void>;
