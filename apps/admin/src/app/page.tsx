import { buildReviewQueue } from '../lib/queue-policy';

const now = new Date('2026-08-28T08:00:00.000Z');
const queue = buildReviewQueue(
  [
    { id: 'MOD-104', risk: 'critical', status: 'auto_hidden', dueAt: '2026-08-27T13:00:00.000Z' },
    { id: 'ID-082', risk: 'sensitive', status: 'identity_review', dueAt: '2026-08-29T09:00:00.000Z' },
    { id: 'MOD-097', risk: 'normal', status: 'open', dueAt: '2026-08-30T11:00:00.000Z' },
  ],
  now,
);

export default function OperationsPage() {
  return (
    <main>
      <aside>
        <div className="brand"><span>🐾</span><strong>WhiskerCommons</strong></div>
        <nav aria-label="Operations navigation">
          <a className="active" href="#queue">Review queue</a>
          <a href="#identity">Identity matches</a>
          <a href="#roles">Role grants</a>
          <a href="#access">Location access</a>
          <a href="#audit">Audit log</a>
        </nav>
        <p className="privacy">Precise locations require task grants and are never shown in list views.</p>
      </aside>
      <section className="workspace">
        <header>
          <div><p className="eyebrow">Private operations</p><h1>Safety review queue</h1><p>Critical content stays hidden until a conflict-free reviewer decides.</p></div>
          <div className="status">Founder shift · active</div>
        </header>
        <section className="metrics" aria-label="Queue metrics">
          <article><strong>1</strong><span>Critical / 24h</span></article>
          <article><strong>2</strong><span>Due within 72h</span></article>
          <article><strong>0</strong><span>Location access grants</span></article>
          <article><strong>100%</strong><span>Actions audited</span></article>
        </section>
        <section className="panel" id="queue">
          <div className="panelHeading"><div><h2>Assigned queue</h2><p>Ordered by animal safety risk, then deadline.</p></div><button type="button">Refresh</button></div>
          <div className="table" role="table" aria-label="Moderation queue">
            <div className="row head" role="row"><span>ID</span><span>Risk</span><span>Status</span><span>Deadline</span><span>Action</span></div>
            {queue.map((item) => (
              <div className="row" role="row" key={item.id}>
                <strong>{item.id}</strong>
                <span className={`pill ${item.risk}`}>{item.risk}</span>
                <span>{item.status.replace('_', ' ')}</span>
                <span className={item.overdue ? 'overdue' : ''}>{item.overdue ? 'Overdue' : 'On time'}</span>
                <button type="button">Review</button>
              </div>
            ))}
          </div>
        </section>
        <section className="guardrail">
          <div><strong>Reviewer recusal enforced</strong><p>Reporters, content authors and target users cannot adjudicate their own cases.</p></div>
          <div><strong>Break-glass disabled</strong><p>Enable only with a reason, DPO notification and 24-hour review.</p></div>
        </section>
      </section>
    </main>
  );
}
