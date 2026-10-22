import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import type { Session } from '../types';
import { SessionRulesEditor } from '../components/SessionRulesEditor';
import { needsRuleReview } from '../database/rules';
import { Plus, Camera, ArrowRight, Archive, RotateCcw } from 'lucide-react';
import { db } from '../database/db';
import { setSessionStatus } from '../database/sessions';
import {
  PageHeading,
  Button,
  Badge,
  Progress,
  Empty,
  displayDate,
  useToast,
} from '../components/ui';
export function SessionsPage({
  onCreate,
  onCapture,
}: {
  onCreate: () => void;
  onCapture: (id: string) => void;
}) {
  const [editingRules, setEditingRules] = useState<Session | null>(null);
  const data = useLiveQuery(
      async () => ({
        sessions: await db.sessions.orderBy('createdAt').reverse().toArray(),
        members: await db.sessionStudents.toArray(),
      }),
      [],
    ),
    toast = useToast();
  async function archive(id: string, status: 'Archived' | 'Paused') {
    try {
      await setSessionStatus(id, status);
      toast(
        status === 'Archived' ? 'Session archived. All photos are retained.' : 'Session restored',
      );
    } catch (e) {
      toast((e as Error).message, true);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="ORGANIZE YOUR CAPTURE DAY"
        title="Capture sessions"
        description="A dedicated queue for each class, batch or department."
      >
        <Button onClick={onCreate}>
          <Plus size={18} />
          Create session
        </Button>
      </PageHeading>
      {data?.sessions.length ? (
        <div className="session-grid">
          {data.sessions.map((s) => {
            const rows = data.members.filter((m) => m.sessionId === s.id),
              done = rows.filter((m) => m.status === 'Completed').length,
              percent = rows.length ? (done / rows.length) * 100 : 0;
            return (
              <article className="panel session-card" key={s.id}>
                <div className="session-card-top">
                  <span className="session-icon">
                    <Camera size={23} />
                  </span>
                  <Badge kind={s.status === 'Completed' ? 'success' : 'neutral'}>{s.status}</Badge>
                </div>
                <h2>{s.name}</h2>
                <p>
                  {s.department || 'Student photo session'}
                  {s.semester ? ` · Semester ${s.semester}` : ''}
                  {s.demo ? ' · DEMO DATA' : ''}
                </p>
                <div className="session-stats">
                  <strong>
                    {done}
                    <span> / {rows.length} photos</span>
                  </strong>
                  <span>{Math.round(percent)}%</span>
                </div>
                <Progress value={percent} />
                <div className="session-statuses">
                  <span>{rows.filter((r) => r.status === 'Pending').length} pending</span>
                  <span>{rows.filter((r) => r.status === 'Skipped').length} skipped</span>
                  <span>{rows.filter((r) => r.status === 'Failed').length} failed</span>
                </div>
                <small className="muted">Created {displayDate(s.createdAt)}</small>
                <div className="session-rule-summary">
                  <span>
                    {s.rules?.requireSheet
                      ? 'Sheet required · Operator review'
                      : needsRuleReview(s.rules)
                        ? 'Custom rules · Operator review'
                        : 'Standard photo checks'}
                  </span>
                  <Button
                    variant="ghost"
                    disabled={s.status === 'Archived'}
                    onClick={() => setEditingRules(s)}
                  >
                    Edit rules
                  </Button>
                </div>
                <div className="session-actions">
                  <Button
                    variant="secondary"
                    onClick={() =>
                      void archive(s.id, s.status === 'Archived' ? 'Paused' : 'Archived')
                    }
                    aria-label={s.status === 'Archived' ? 'Restore session' : 'Archive session'}
                  >
                    {s.status === 'Archived' ? <RotateCcw size={17} /> : <Archive size={17} />}
                  </Button>
                  <Button disabled={s.status === 'Archived'} onClick={() => onCapture(s.id)}>
                    {s.status === 'Completed'
                      ? 'Review session'
                      : s.status === 'Draft'
                        ? 'Start capture'
                        : 'Resume session'}
                    <ArrowRight size={16} />
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <section className="panel">
          <Empty
            title="Ready for your first session?"
            description="Group your students, then work through their photos in order."
            action={
              <Button onClick={onCreate}>
                <Plus size={17} />
                Create session
              </Button>
            }
          />
        </section>
      )}
      {editingRules && (
        <SessionRulesEditor session={editingRules} onClose={() => setEditingRules(null)} />
      )}
    </>
  );
}
