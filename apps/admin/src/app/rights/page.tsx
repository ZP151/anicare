import {randomUUID} from 'node:crypto';
import {redirect} from 'next/navigation';
import {getAdminSession} from '../../lib/admin-session';
import {createAdminServerClient} from '../../lib/supabase/server';
import {listRightsQueue,RIGHTS_UUID} from '../../lib/rights-api';
import {updateRightsAction,processErasureAction} from '../actions/rights';
export const dynamic='force-dynamic';export const revalidate=0;
export default async function RightsPage({searchParams}:{searchParams:Promise<{cursor?:string;error?:string;requestId?:string;actionRequestId?:string}>}){
 const params=await searchParams;const session=await getAdminSession(async()=>await createAdminServerClient() as never);
 if(session.state==='unauthenticated')redirect('/login');
 if(session.state!=='authorised')return <main><section className="panel"><h1>Rights queue unavailable</h1><p>An active platform-admin session is required.</p></section></main>;
 let rows;try{rows=await listRightsQueue(session.client,params.cursor??null);}catch{return <main><section className="panel"><h1>Rights queue unavailable</h1><a href="/rights">Retry</a></section></main>;}
 return <main><aside><nav aria-label="Operations navigation"><a href="/">Content reports</a><a href="/identity">Identity review</a><a href="/rights">Rights requests</a></nav></aside><section className="workspace"><h1>Rights and account deletion requests</h1><p>Handle each request through the relevant process. Closing an intake does not merge cats or confirm an identity. Account deletion remains pending until Auth and linked media cleanup converge.</p><a href="/rights">Refresh requests</a>
 {params.error?<p role="alert">The response could not be confirmed. Check the request status before retrying. Repeated account processing checks Auth before deleting again.</p>:null}
 {rows.length===0?<p>No available requests.</p>:rows.map(row=>{
 const actionId=params.requestId===row.requestId&&params.actionRequestId&&RIGHTS_UUID.test(params.actionRequestId)?params.actionRequestId:randomUUID();
 return <section className="panel" key={row.requestId}><h2>{row.kind.replaceAll('_',' ')}</h2><p>{row.status.replaceAll('_',' ')} · Received {new Date(row.receivedAt).toLocaleString()}</p><p>Receipt: {row.requestId}</p>{row.detail?<p style={{whiteSpace:'pre-wrap'}}>{row.detail}</p>:null}{row.animalId?<p>Referenced cat: {row.animalId}</p>:null}
 {row.kind==='account_erasure'?<form action={processErasureAction}><input type="hidden" name="requestId" value={row.requestId}/><button type="submit" disabled={row.status==='completed'}>Process deletion / retry cleanup</button></form>:<form action={updateRightsAction}><input type="hidden" name="requestId" value={row.requestId}/><input type="hidden" name="actionRequestId" value={actionId}/><button name="status" value="reviewing">Start review</button><button name="status" value="needs_new_proposal">Request a new identity proposal</button><button name="status" value="closed">Close intake</button></form>}
 </section>;})}
 {rows.length===20?<a href={`/rights?cursor=${rows[19]!.cursor}`}>Next page</a>:null}
 </section></main>;
}
