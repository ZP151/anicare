import { randomUUID } from 'node:crypto';

import { redirect } from 'next/navigation';

import { resolveModerationReportAction } from './actions/moderation';
import { getAdminSession } from '../lib/admin-session';
import { listModerationQueue } from '../lib/moderation-api';
import { createAdminServerClient } from '../lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function OperationsPage() {
  const session = await getAdminSession(async () => (await createAdminServerClient()) as never);

  if (session.state === 'unavailable') {
    return <main><section className="panel"><h1>Operations console unavailable</h1><p>The public connection is not configured.</p></section></main>;
  }
  if (session.state === 'unauthenticated') redirect('/login');
  if (session.state === 'unauthorised') {
    return <main><section className="panel"><h1>Access denied</h1><p>This signed-in account does not have an active platform-admin grant.</p></section></main>;
  }

  let queue;
  try {
    queue = await listModerationQueue(session.client, randomUUID());
  } catch {
    return <main><section className="panel"><h1>Operations console unavailable</h1><p>The moderated queue could not be loaded safely.</p></section></main>;
  }

  return (
    <main>
      <aside>
        <div className="brand"><span>🐾</span><strong>WhiskerCommons</strong></div>
        <nav aria-label="Operations navigation">
          <a className="active" href="#queue">Review queue</a>
        </nav>
        <p className="privacy">This console never displays precise locations, media paths, access grants, or audit records.</p>
      </aside>
      <section className="workspace">
        <header>
          <div><p className="eyebrow">Authenticated operations</p><h1>Safety review queue</h1><p>Each read and decision is server-authorized and audited. Recusal is enforced at decision time.</p></div>
          <div className="status">Platform admin</div>
        </header>
        <section className="panel" id="queue">
          <div className="panelHeading"><div><h2>Open queue</h2><p>Only safe report metadata is shown.</p></div></div>
          <div className="table" role="table" aria-label="Moderation queue">
            <div className="row head" role="row"><span>Report</span><span>Risk</span><span>Status</span><span>Deadline</span><span>Decision</span></div>
            {queue.map((item) => (
              <div className="row" role="row" key={item.reportId}>
                <strong>{item.reportId}</strong>
                <span className={`pill ${item.risk}`}>{item.risk}</span>
                <span>{item.status.replace('_', ' ')}</span>
                <span>{new Date(item.dueAt).toLocaleString()}</span>
                <form action={resolveModerationReportAction}>
                  <input name="reportId" type="hidden" value={item.reportId} />
                  <select aria-label={`Decision for ${item.reportId}`} name="action" defaultValue="no_action">
                    <option value="no_action">No action</option>
                    <option value="hide_sighting">Hide sighting</option>
                    <option value="restore_sighting">Restore to limited</option>
                  </select>
                  <input aria-label={`Rationale for ${item.reportId}`} name="rationale" minLength={10} maxLength={2000} required />
                  <button type="submit">Record</button>
                </form>
              </div>
            ))}
          </div>
        </section>
        <section className="guardrail">
          <div><strong>Reviewer recusal enforced</strong><p>Reporters, content authors, and targets cannot adjudicate their own cases.</p></div>
          <div><strong>High-risk restoration is constrained</strong><p>Restoration returns a sighting only to limited visibility and cannot override active holds.</p></div>
        </section>
      </section>
    </main>
  );
}
