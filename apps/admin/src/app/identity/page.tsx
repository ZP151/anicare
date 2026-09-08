import { randomUUID } from 'node:crypto';

import { redirect } from 'next/navigation';

import { resolveIdentityReviewAction } from '../actions/identity';
import { getIdentityReviewDetail, listIdentityReviewQueue } from '../../lib/identity-api';
import { getIdentityReviewerSession } from '../../lib/identity-session';
import { createAdminServerClient } from '../../lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function IdentityWorkbenchPage({ searchParams }: { searchParams: Promise<{ proposalId?: string; requestId?: string; error?: string; beforeCreatedAt?: string; beforeProposalId?: string }> }) {
  const parameters = await searchParams;
  const session = await getIdentityReviewerSession(async () => (await createAdminServerClient()) as never);
  if (session.state === 'unavailable') return <main><section className="panel"><h1>Identity workbench unavailable</h1><p>The workbench cannot safely load review data.</p></section></main>;
  if (session.state === 'unauthenticated') redirect('/login');
  if (session.state === 'unauthorised') return <main><section className="panel"><h1>Access denied</h1><p>This account does not have an active identity-review grant.</p></section></main>;

  const before = parameters.beforeCreatedAt && parameters.beforeProposalId && UUID.test(parameters.beforeProposalId)
    ? { createdAt: parameters.beforeCreatedAt, proposalId: parameters.beforeProposalId } : null;
  const pageQuery = new URLSearchParams(before ? { beforeCreatedAt: before.createdAt, beforeProposalId: before.proposalId } : {});
  const proposalHref = (proposalId: string) => { const query = new URLSearchParams(pageQuery); query.set('proposalId', proposalId); return `/identity?${query}`; };
  let queue;
  try { queue = await listIdentityReviewQueue(session.client, { limit: 20, before, requestId: randomUUID() }); }
  catch { return <main><section className="panel"><h1>Identity workbench unavailable</h1><p>The review queue could not be loaded safely.</p></section></main>; }
  const selectedId = parameters.proposalId && UUID.test(parameters.proposalId) ? parameters.proposalId : queue[0]?.proposalId;
  const detail = selectedId ? await getIdentityReviewDetail(session.client, selectedId, randomUUID()).catch(() => null) : null;
  const stableRequestId = parameters.requestId && UUID.test(parameters.requestId) ? parameters.requestId : randomUUID();

  return <main>
    <aside><div className="brand"><span>🐾</span><strong>WhiskerCommons</strong></div><nav aria-label="Operations navigation"><a href="/">Safety review</a><a className="active" href="/identity">Identity review</a></nav><p className="privacy">Identity review shows only coarse context and an authorized private image. It never displays notes, coordinates, account IDs, or storage references.</p></aside>
    <section className="workspace">
      <header><div><p className="eyebrow">Authenticated identity operations</p><h1>Identity review queue</h1><p>Area scope and recusal are checked on every read and decision.</p></div><div className="status">Trusted reviewer</div></header>
      {parameters.error ? <p role="alert">The response could not be confirmed. Retry keeps the same request identifier; a completed proposal may have left the queue.</p> : null}
      <section className="panel"><h2>Open proposals</h2>{queue.length === 0 ? <p>No eligible identity proposals are waiting.</p> : <div className="table" role="table" aria-label="Identity review queue">{queue.map((item) => <div className="row" role="row" key={item.proposalId}><a href={proposalHref(item.proposalId)}>{item.source.replace('_', ' ')}</a><span>{new Date(item.createdAt).toLocaleString()}</span><span>{item.status}</span></div>)}</div>}
        {queue.length === 20 ? <a href={`/identity?${new URLSearchParams({ beforeCreatedAt: queue[queue.length - 1]!.createdAt, beforeProposalId: queue[queue.length - 1]!.proposalId })}`}>Next page</a> : null}
        {before ? <a href="/identity">Back to first page</a> : null}
        <a href={`/identity?${pageQuery}`}>Refresh queue</a>
      </section>
      {detail ? <section className="panel"><h2>Review proposal</h2><p>Source: {detail.source.replace('_', ' ')} · Submitted {new Date(detail.createdAt).toLocaleString()} · Time bucket: {detail.timeBucket}</p>{detail.proposedAlias ? <p>Proposed profile: {detail.proposedAlias}</p> : null}
        {detail.evidenceState === 'available' ? <img alt="Authorized private identity evidence" src={`/identity/${detail.proposalId}/media`} style={{ maxWidth: '100%', borderRadius: 8 }} /> : <p>Authorized image material is unavailable. Do not treat this as enough evidence to confirm.</p>}
        {detail.source !== 'new_animal' ? <p>Compare the source photo with the proposed cat using your independent knowledge. Request more evidence if you cannot establish the match.</p> : null}
        <form action={resolveIdentityReviewAction.bind(null, detail.source)}><input type="hidden" name="proposalId" value={detail.proposalId} /><input type="hidden" name="requestId" value={stableRequestId} />
          <label htmlFor="rationale">Decision rationale</label><textarea id="rationale" name="rationale" minLength={10} maxLength={1000} required />
          {detail.source === 'new_animal' ? <><label htmlFor="alias">New cat name (required to confirm)</label><input id="alias" name="alias" minLength={1} maxLength={80} /></> : null}
          {detail.source !== 'new_animal' ? <button name="decision" value="confirm" type="submit" disabled={detail.evidenceState !== 'available'}>Confirm match</button> : <button name="decision" value="confirm" type="submit" disabled={detail.evidenceState !== 'available'}>Confirm new cat</button>}
          <button name="decision" value="needs_more_evidence" type="submit">Needs more evidence</button><button name="decision" value="reject" type="submit">Reject</button>
        </form>
      </section> : null}
    </section>
  </main>;
}
